const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
const port = 3000;

app.use(bodyParser.json());

const ADAPTER_API_URL = process.env.ADAPTER_API_URL || 'http://localhost:4000';

const generateDynamicToken = (username) => {
  const currentDate = new Date().toISOString().slice(0, 10);
  const secret = process.env.TOKEN_SECRET || 'default_secret';
  return crypto.createHash('sha256').update(username + currentDate + secret).digest('hex');
};

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const username = req.headers['x-user'];
  if (!authHeader || !username)
    return res.status(401).json({ error: 'Missing Authorization or X-User header' });
  const providedToken = authHeader.split(' ')[1];
  if (providedToken !== generateDynamicToken(username))
    return res.status(403).json({ error: 'Invalid or expired token' });
  req.username = username;
  next();
};

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Backend API',
      version: '1.0.0',
      description: 'API documentation for the Backend service (storefront)',
    },
    servers: [{ url: 'http://localhost:3000' }],
  },
  apis: ['./index.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /login:
 *   post:
 *     summary: Login to the storefront.
 *     description: Authenticate with username and password to receive an access token.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: user
 *               password:
 *                 type: string
 *                 example: userpass
 *     responses:
 *       200:
 *         description: Successful login returns a dynamic token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   example: "a4c7e5..."
 *       400:
 *         description: Username or password missing.
 *       401:
 *         description: Invalid credentials.
 *       500:
 *         description: Internal server error.
 */
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password are required' });
    const response = await axios.post(`${ADAPTER_API_URL}/users/validate`, { username, password });
    res.json({ token: response.data.token });
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401)
        return res.status(401).json({ error: 'Invalid credentials' });
      return res.status(error.response.status).json({
        error: error.response.data.error || 'Error validating credentials'
      });
    }
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

/**
 * @swagger
 * /items:
 *   get:
 *     summary: Retrieve a paginated list of items.
 *     description: Retrieves items by forwarding paging parameters ("page" and "limit") to the Adapter API.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: The page number to retrieve.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: The number of items per page (max 1000).
 *     responses:
 *       200:
 *         description: A paginated list of items.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 total:
 *                   type: integer
 *       500:
 *         description: Internal Server Error.
 */
app.get('/items', async (req, res) => {
  try {
    const { page, limit } = req.query;
    const response = await axios.get(`${ADAPTER_API_URL}/items`, { params: { page, limit } });
    res.json(response.data);
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data.error || 'Error fetching items'
      });
    }
    res.status(500).json({ error: 'Internal Server Error fetching items' });
  }
});

/**
 * @swagger
 * /items/{id}:
 *   get:
 *     summary: Get item details.
 *     description: Retrieve details for a specific item by its ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the item.
 *     responses:
 *       200:
 *         description: Details of the item.
 *       404:
 *         description: Item not found.
 *       500:
 *         description: Error fetching item details.
 */
app.get('/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const response = await axios.get(`${ADAPTER_API_URL}/items/${id}`);
    res.json(response.data);
  } catch (error) {
    if (error.response) {
      if (error.response.status === 404)
        return res.status(404).json({ error: 'Item not found' });
      return res.status(error.response.status).json({
        error: error.response.data.error || 'Error fetching item details'
      });
    }
    res.status(500).json({ error: 'Internal server error fetching item details' });
  }
});

/**
 * @swagger
 * /cart:
 *   post:
 *     summary: Add an item to the shopping cart.
 *     description: Requires authentication.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               itemId:
 *                 type: integer
 *                 example: 1
 *               quantity:
 *                 type: integer
 *                 example: 2
 *     responses:
 *       200:
 *         description: Item added to cart.
 *       400:
 *         description: Missing itemId or quantity.
 *       401:
 *         description: Missing or invalid authentication.
 *       500:
 *         description: Internal server error.
 */
app.post('/cart', authMiddleware, (req, res) => {
  const { itemId, quantity } = req.body;
  if (!itemId || !quantity)
    return res.status(400).json({ error: 'Item ID and quantity are required' });
  global.carts = global.carts || {};
  global.carts[req.username] = global.carts[req.username] || [];
  global.carts[req.username].push({ itemId, quantity });
  res.json({ message: 'Item added to cart', cart: global.carts[req.username] });
});

/**
 * @swagger
 * /checkout:
 *   post:
 *     summary: Checkout the shopping cart.
 *     description: Requires authentication. Processes checkout and clears the cart.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Checkout successful.
 *       400:
 *         description: Cart is empty.
 *       401:
 *         description: Missing or invalid authentication.
 *       500:
 *         description: Internal server error.
 */
app.post('/checkout', authMiddleware, (req, res) => {
  if (!global.carts || !global.carts[req.username] || global.carts[req.username].length === 0)
    return res.status(400).json({ error: 'Cart is empty' });
  global.carts[req.username] = [];
  res.json({ message: 'Checkout successful. Payment processed.' });
});

/**
 * @swagger
 * /payment:
 *   post:
 *     summary: Process a payment.
 *     description: Requires authentication.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment processed successfully.
 *       401:
 *         description: Missing or invalid authentication.
 *       500:
 *         description: Internal server error.
 */
app.post('/payment', authMiddleware, (req, res) => {
  res.json({ message: 'Payment processed successfully (simulated).' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Backend API listening on http://localhost:${port}`);
});

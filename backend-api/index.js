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
global.checkoutCompleted = {};

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const username = req.headers['x-user'];
  if (!authHeader || !username)
    return res.status(401).json({ error: 'Missing Authorization or X-User header' });

  const providedToken = authHeader.split(' ')[1];

  try {
    const response = await axios.post(`${ADAPTER_API_URL}/verify-token`, {
      username,
      token: providedToken
    });

    if (response.data.valid) {
      req.username = username;
      next();
    } else {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
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
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        XUser: {
          type: 'apiKey',
          in: 'header',
          name: 'X-User',
          description: 'Custom header for user identification - username',
        }
      },
    },
  },
  apis: ['./index.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Register new user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - firstname
 *               - surname
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               firstname:
 *                 type: string
 *               surname:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully.
 *       400:
 *         description: Bad request. Missing or invalid fields.
 *       500:
 *         description: Internal server error.
 */
app.post('/register', async (req, res) => {
  try {
    const { username, firstname, surname, password } = req.body;
    if (!username || !firstname || !surname || !password)
      return res.status(400).json({ error: 'Username, firstname, surname and password are required' });

    const userData = { username, role: 'user', firstname, surname, password };
    const response = await axios({ method: 'post', url: `${ADAPTER_API_URL}/users`, data: userData });
    res.status(response.status).json(response.data);

  } catch (error) {
    res.status(500).json({ error: 'Internal server error', message: error.response.data });
  }
});

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
 *     summary: Add an item to the cart.
 *     description: Requires authentication. Validates item existence before adding.
 *     security:
 *       - bearerAuth: []
 *       - XUser: []
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
 *         description: Item added successfully.
 *       400:
 *         description: Invalid or missing parameters.
 *       404:
 *         description: Item not found.
 *       401:
 *         description: Unauthorized request.
 *       500:
 *         description: Server error.
 */
app.post('/cart', authMiddleware, async (req, res) => {
  let { itemId, quantity } = req.body;

  if (typeof itemId === 'string' && !isNaN(itemId)) {
    itemId = parseInt(itemId, 10);
  }

  if (typeof quantity === 'string' && !isNaN(quantity)) {
    quantity = parseInt(quantity, 10);
  }

  if (!itemId || !quantity) {
    return res.status(400).json({ error: 'Item ID and quantity are required' });
  }
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return res.status(400).json({ error: 'Invalid item ID, must be a positive integer' });
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'Invalid quantity, must be a positive integer' });
  }

  try {
    const itemResponse = await axios.get(`${ADAPTER_API_URL}/items/${itemId}`);

    if (!itemResponse || !itemResponse.data) {
      return res.status(404).json({ error: 'Item not found' });
    }

    global.carts = global.carts || {};
    global.carts[req.username] = global.carts[req.username] || [];
    global.carts[req.username].push({ itemId, quantity });

    res.json({ message: 'Item added to cart', cart: global.carts[req.username] });

  } catch (error) {
    if (error.response && error.response.status === 404) {
      return res.status(404).json({ error: 'Item not found' });
    }
    console.error('Error checking item:', error.message);
    res.status(500).json({ error: 'Internal server error while validating item' });
  }
});

/**
 * @swagger
 * /cart/items:
 *   get:
 *     summary: Get the list of items in the cart.
 *     description: Requires authentication.
 *     security:
 *       - bearerAuth: []
 *       - XUser: []
 *     responses:
 *       200:
 *         description: List of items in the cart.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   itemId:
 *                     type: string
 *                     description: The ID of the item.
 *                   quantity:
 *                     type: integer
 *                     description: The quantity of the item.
 *       401:
 *         description: Missing or invalid authentication.
 *       500:
 *         description: Internal server error.
 */
app.get('/cart/items', authMiddleware, (req, res) => {
  const cart = global.carts[req.username] || [];

  const parsedCart = cart.map(item => ({
    itemId: parseInt(item.itemId, 10),
    quantity: parseInt(item.quantity, 10)
  }));

  res.json(parsedCart);
});

/**
 * @swagger
 * /cart/items:
 *   delete:
 *     summary: Delete an item from the cart.
 *     description: Requires authentication.
 *     security:
 *       - bearerAuth: []
 *       - XUser: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               itemId:
 *                 type: string
 *                 description: The ID of the item to delete.
 *     responses:
 *       200:
 *         description: Item deleted from the cart.
 *       400:
 *         description: Item not found in the cart.
 *       401:
 *         description: Missing or invalid authentication.
 *       500:
 *         description: Internal server error.
 */
app.delete('/cart/items', authMiddleware, (req, res) => {
  let { itemId } = req.body;

  if (typeof itemId === 'string' && !isNaN(itemId)) {
      itemId = parseInt(itemId, 10);
  }

  if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ error: 'Invalid item ID, must be a positive integer' });
  }

  const cart = global.carts[req.username] || [];
  
  const itemIndex = cart.findIndex(item => Number(item.itemId) === itemId);

  if (itemIndex === -1) {
      return res.status(400).json({ error: 'Item not found in the cart' });
  }

  const deletedItem = cart[itemIndex];

  cart.splice(itemIndex, 1);
  global.carts[req.username] = cart;

  res.json({ message: 'Item deleted from the cart', deletedItem });
});

/**
 * @swagger
 * /checkout:
 *   post:
 *     summary: Checkout the shopping cart.
 *     description: Requires authentication. Processes checkout and and prepares for payment.
 *     security:
 *       - bearerAuth: []
 *       - XUser: []
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
  global.checkoutCompleted[req.username] = true;
  res.json({ message: 'Checkout successful. Ready for payment.' });
});

/**
 * @swagger
 * /payment:
 *   post:
 *     summary: Process a payment.
 *     description: Requires authentication.
 *     security:
 *       - bearerAuth: []
 *       - XUser: []
 *     responses:
 *       200:
 *         description: Payment processed successfully.
 *       400:
 *         description: Checkout not completed.
 *       401:
 *         description: Missing or invalid authentication.
 *       500:
 *         description: Internal server error.
 */
app.post('/payment', authMiddleware, (req, res) => {
  if (!global.checkoutCompleted[req.username]) {
    return res.status(400).json({ error: 'Checkout not completed' });
  }

  // Process payment logic here
  global.checkoutCompleted[req.username] = false; // Reset checkout flag after payment
  res.json({ message: 'Payment successful' });
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Check API health status
 *     description: Returns the health status of the API
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 timestamp:
 *                   type: string
 *                   example: "2024-01-01T12:00:00.000Z"
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Middleware to handle unsupported methods
app.use((req, res, next) => {
  res.status(405).json({ error: 'Method Not Allowed' });
});

// Middleware to handle invalid endpoints
app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint Not Found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Backend API listening on http://localhost:${port}`);
});

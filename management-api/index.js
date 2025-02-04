const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const crypto = require('crypto');

const app = express();
const port = 3500;

app.use(bodyParser.json({ limit: '50mb' }));

// Environment variables
const ADAPTER_API_URL = process.env.ADAPTER_API_URL || 'http://adapter-api:4000';
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'default_secret';

/**
 * Swagger configuration for Management API.
 */
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Management API',
      version: '1.0.0',
      description: 'API documentation for the Management service (admin only)',
    },
    servers: [{ url: 'http://localhost:3500' }],
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
 * Generate a dynamic token based on the username, current date, and secret.
 */
const generateDynamicToken = (username) => {
  const currentDate = new Date().toISOString().slice(0, 10);
  return crypto.createHash('sha256').update(username + currentDate + TOKEN_SECRET).digest('hex');
};

/**
 * Admin authentication middleware.
 */
app.use(async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const username = req.headers['x-user'];
  if (!authHeader)
    return res.status(401).json({ error: 'Missing Authorization header' });

  let response;
  try {
    response = await axios.post(`${ADAPTER_API_URL}/user/role`, { username });
  } catch (error) {
    const status = error.response?.status || 500;
    const message =
      status === 404 ? 'User not found' : 'Error retrieving user role';
    return res.status(status).json({ error: message });
  }

  if (response.data.role !== 'admin')
    return res.status(403).json({ error: 'Forbidden: Admins only' });

  const providedToken = authHeader.split(' ')[1];
  if (providedToken !== generateDynamicToken(username))
    return res.status(403).json({ error: 'Forbidden: Invalid token' });

  next();
});

/**
 * Helper to handle axios errors.
 */
const handleAxiosError = (res, error, notFoundMsg, fallbackMsg) => {
  if (error.response) {
    if (error.response.status === 404 && notFoundMsg)
      return res.status(404).json({ error: notFoundMsg });
    return res
      .status(error.response.status)
      .json({ error: error.response.data.error || fallbackMsg });
  }
  res.status(500).json({ error: fallbackMsg });
};

/**
 * Generic forwarder for requests to the Adapter API.
 * @param {string} method - HTTP method (e.g. 'get', 'post', etc.)
 * @param {string} endpoint - The endpoint path on the Adapter API.
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 * @param {object} options - Optional settings: { notFoundMsg, fallbackMsg, successStatus }.
 */
const forwardRequest = async (method, endpoint, req, res, { notFoundMsg, fallbackMsg, successStatus } = {}) => {
  try {
    const response = await axios({
      method,
      url: `${ADAPTER_API_URL}${endpoint}`,
      data: req.body,
      params: req.query,
    });
    res.status(successStatus || response.status).json(response.data);
  } catch (error) {
    handleAxiosError(res, error, notFoundMsg, fallbackMsg);
  }
};

/* ----------------------------
 * USERS MANAGEMENT ENDPOINTS
 * ----------------------------
 */

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Retrieve a list of users.
 *     security:
 *       - bearerAuth: []
 *       - XUser: []
 *     responses:
 *       200:
 *         description: A list of users.
 *       500:
 *         description: Error fetching users.
 */
app.get('/users', (req, res) =>
  forwardRequest('get', '/users', req, res, { fallbackMsg: 'Error fetching users' })
);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Retrieve a user by ID.
 *     security:
 *       - bearerAuth: []
 *       - XUser: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the user.
 *     responses:
 *       200:
 *         description: A user.
 *       404:
 *         description: User not found.
 *       500:
 *         description: Error fetching user.
 */
app.get('/users/:id', (req, res) =>
  forwardRequest('get', `/users/${req.params.id}`, req, res, {
    notFoundMsg: 'User not found',
    fallbackMsg: 'Error fetching user',
  })
);

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create a new user.
 *     security:
 *       - bearerAuth: []
 *       - XUser: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - role
 *               - firstname
 *               - surname
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               role:
 *                 type: string
 *               firstname:
 *                 type: string
 *               surname:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully.
 *       400:
 *         description: Bad request. Missing or invalid fields.
 *       500:
 *         description: Internal server error.
 */
app.post('/users', (req, res) =>
  forwardRequest('post', '/users', req, res, { fallbackMsg: 'Error creating user', successStatus: 201 })
);

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Update an existing user.
 *     security:
 *       - bearerAuth: []
 *       - XUser: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               role:
 *                 type: string
 *               firstname:
 *                 type: string
 *               surname:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: User updated.
 *       404:
 *         description: User not found.
 *       500:
 *         description: Error updating user.
 */
app.put('/users/:id', (req, res) =>
  forwardRequest('put', `/users/${req.params.id}`, req, res, {
    notFoundMsg: 'User not found',
    fallbackMsg: 'Error updating user',
  })
);

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete a user.
 *     security:
 *       - bearerAuth: []
 *       - XUser: []
 *     deprecated: true
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to delete.
 *     responses:
 *       200:
 *         description: User deleted.
 *       404:
 *         description: User not found.
 *       500:
 *         description: Error deleting user.
 */
/* app.delete('/users/:id', (req, res) =>
  forwardRequest('delete', `/users/${req.params.id}`, req, res, {
    notFoundMsg: 'User not found',
    fallbackMsg: 'Error deleting user',
  })
); */

/* ----------------------------
 * ITEMS MANAGEMENT ENDPOINTS
 * ----------------------------
 */

/**
 * @swagger
 * /items:
 *   post:
 *     summary: Create a new item.
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
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *     responses:
 *       201:
 *         description: Item created.
 *       500:
 *         description: Error creating item.
 */
app.post('/items', (req, res) =>
  forwardRequest('post', '/items', req, res, { fallbackMsg: 'Error creating item', successStatus: 201 })
);

/**
 * @swagger
 * /items/batch:
 *   post:
 *     summary: Create multiple items at once.
 *     description: Forwards an array of items to the Adapter API for batch creation.
 *     security:
 *       - bearerAuth: []
 *       - XUser: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               required:
 *                 - name
 *                 - price
 *               properties:
 *                 name:
 *                   type: string
 *                 description:
 *                   type: string
 *                 price:
 *                   type: number
 *     responses:
 *       201:
 *         description: Items created successfully.
 *       400:
 *         description: Invalid input data.
 *       500:
 *         description: Internal Server Error.
 */
app.post('/items/batch', (req, res) =>
  forwardRequest('post', '/items/batch', req, res, {
    fallbackMsg: 'Error creating batch items',
    successStatus: 201,
  })
);

/**
 * @swagger
 * /items/{id}:
 *   put:
 *     summary: Update an existing item.
 *     security:
 *       - bearerAuth: []
 *       - XUser: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the item to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *     responses:
 *       200:
 *         description: Item updated.
 *       404:
 *         description: Item not found.
 *       500:
 *         description: Error updating item.
 */
app.put('/items/:id', (req, res) =>
  forwardRequest('put', `/items/${req.params.id}`, req, res, {
    notFoundMsg: 'Item not found',
    fallbackMsg: 'Error updating item',
  })
);

/**
 * @swagger
 * /items/{id}:
 *   delete:
 *     summary: Delete an item.
 *     security:
 *       - bearerAuth: []
 *       - XUser: []
 *     deprecated: true
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the item to delete.
 *     responses:
 *       200:
 *         description: Item deleted.
 *       404:
 *         description: Item not found.
 *       500:
 *         description: Error deleting item.
 */
/* app.delete('/items/:id', (req, res) =>
  forwardRequest('delete', `/items/${req.params.id}`, req, res, {
    notFoundMsg: 'Item not found',
    fallbackMsg: 'Error deleting item',
  })
);
 */

// Global error-handling middleware (catch-all)
app.use((err, req, res, next) => {
  console.error('Unhandled error in Management API:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Management API listening on http://localhost:${port}`);
});

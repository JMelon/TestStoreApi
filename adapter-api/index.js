const express = require('express');
const { Pool } = require('pg');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = 4000;

app.use(express.json({ limit: '50mb' }));

const generateDynamicToken = (username) => {
  const currentDate = new Date().toISOString().slice(0, 10);
  const secret = process.env.TOKEN_SECRET || "default_secret";
  return crypto.createHash('sha256').update(username + currentDate + secret).digest('hex');
};

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'store_db',
  password: process.env.PGPASSWORD || 'password',
  port: process.env.PGPORT || 5432,
});

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Adapter API',
      version: '1.0.0',
      description: 'API documentation for the Adapter service (data access layer)',
    },
    servers: [{ url: 'http://localhost:4000' }],
  },
  apis: ['./index.js'],
};
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

async function waitForPostgres(retries = 10, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log("Connected to PostgreSQL.");
      return;
    } catch (err) {
      console.log(`PostgreSQL not ready, retrying in ${delay}ms... (${i + 1}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error("Unable to connect to PostgreSQL after several retries");
}

async function initializeDatabase() {
  await waitForPostgres();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        price NUMERIC(10,2) NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        firstname VARCHAR(100) NOT NULL,
        surname VARCHAR(100) NOT NULL,
        role VARCHAR(50) NOT NULL,
        password VARCHAR(255) NOT NULL
      );
    `);

    const itemResult = await pool.query('SELECT COUNT(*) FROM items;');
    const itemCount = parseInt(itemResult.rows[0].count, 10);
    if (itemCount === 0) {
      console.log('Seeding items from store_catalog.json...');
      const filePath = path.join(__dirname, 'store_catalog.json');
      const fileContent = await fs.readFile(filePath, 'utf8');
      const items = JSON.parse(fileContent);

      const insertValues = [];
      const params = [];
      let paramIndex = 1;
      for (const item of items) {
        if (!item.name || item.price === undefined) {
          console.warn('Skipping invalid item:', item);
          continue;
        }
        insertValues.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
        params.push(item.name, item.description || '', parseFloat(item.price));
      }

      if (insertValues.length > 0) {
        const insertQuery = `
          INSERT INTO items (name, description, price)
          VALUES ${insertValues.join(', ')};
        `;
        await pool.query(insertQuery, params);
        console.log('Seeding complete.');
      } else {
        console.log('No valid items found in store_catalog.json.');
      }
    }

    const userResult = await pool.query('SELECT COUNT(*) FROM users;');
    const userCount = parseInt(userResult.rows[0].count, 10);
    if (userCount === 0) {
      console.log('Seeding dummy users...');
      await pool.query(`
        INSERT INTO users (username, firstname, surname, role, password)
        VALUES 
          ('jdoe123', 'John', 'Doe', 'admin', 'jdoe@123'),
          ('asmith456', 'Alice', 'Smith', 'user', 'asmith@456'),
          ('bwilson789', 'Bob', 'Wilson', 'user', 'bwilson@789'),
          ('cjohnson101', 'Carol', 'Johnson', 'user', 'cjohnson@101'),
          ('dlee202', 'David', 'Lee', 'user', 'dlee@202'),
          ('emartinez303', 'Eva', 'Martinez', 'user', 'emartinez@303'),
          ('fclark404', 'Frank', 'Clark', 'user', 'fclark@404'),
          ('grodriguez505', 'Grace', 'Rodriguez', 'user', 'grodriguez@505'),
          ('hhernandez606', 'Henry', 'Hernandez', 'user', 'hhernandez@606'),
          ('iyoung707', 'Ivy', 'Young', 'user', 'iyoung@707'),
          ('jking808', 'Jack', 'King', 'user', 'jking@808'),
          ('kwright909', 'Karen', 'Wright', 'user', 'kwright@909'),
          ('lscott1010', 'Liam', 'Scott', 'user', 'lscott@1010'),
          ('mgreen1111', 'Mia', 'Green', 'user', 'mgreen@1111'),
          ('nhall1212', 'Noah', 'Hall', 'user', 'nhall@1212'),
          ('oadams1313', 'Olivia', 'Adams', 'user', 'oadams@1313'),
          ('pnelson1414', 'Paul', 'Nelson', 'user', 'pnelson@1414'),
          ('qcarter1515', 'Quinn', 'Carter', 'user', 'qcarter@1515'),
          ('rmitchell1616', 'Rachel', 'Mitchell', 'user', 'rmitchell@1616'),
          ('sperez1717', 'Samuel', 'Perez', 'user', 'sperez@1717'),
          ('troberts1818', 'Taylor', 'Roberts', 'user', 'troberts@1818'),
          ('uturner1919', 'Uma', 'Turner', 'user', 'uturner@1919'),
          ('vphillips2020', 'Victor', 'Phillips', 'user', 'vphillips@2020'),
          ('wcampbell2121', 'Wendy', 'Campbell', 'user', 'wcampbell@2121'),
          ('xedwards2222', 'Xander', 'Edwards', 'user', 'xedwards@2222');
      `);
    }
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

/**
 * @swagger
 * /items:
 *   get:
 *     summary: Retrieve a paginated list of items.
 *     description: |
 *       Retrieve items with paging.
 *       Accepts optional query parameters:
 *         - page (default: 1)
 *         - limit (default: 10, max: 1000)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: The page number.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: The number of items per page.
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
    let { page, limit } = req.query;
    page = parseInt(page) || 1;
    limit = parseInt(limit);
    limit = isNaN(limit) ? 10 : Math.min(limit, 1000);
    const offset = (page - 1) * limit;

    const totalResult = await pool.query('SELECT COUNT(*) FROM items');
    const total = parseInt(totalResult.rows[0].count, 10);
    const result = await pool.query('SELECT * FROM items ORDER BY id LIMIT $1 OFFSET $2', [limit, offset]);

    res.json({ items: result.rows, page, limit, total });
  } catch (error) {
    console.error('Error fetching paginated items:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /items/batch:
 *   post:
 *     summary: Create multiple items at once.
 *     description: Accepts an array of item objects. Each must include "name" and "price"; "description" is optional.
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
app.post('/items/batch', async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: "Expected an array of items." });
  }

  const itemsToInsert = req.body;
  for (const [index, item] of itemsToInsert.entries()) {
    if (!item.name || item.price === undefined) {
      return res.status(400).json({ error: `Item at index ${index} must have a "name" and "price".` });
    }
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const insertedItems = [];
      for (const item of itemsToInsert) {
        const { name, description = '', price } = item;
        const result = await client.query(
          'INSERT INTO items (name, description, price) VALUES ($1, $2, $3) RETURNING *;',
          [name, description, price]
        );
        insertedItems.push(result.rows[0]);
      }
      await client.query('COMMIT');
      return res.status(201).json(insertedItems);
    } catch (innerError) {
      await client.query('ROLLBACK');
      console.error("Error during batch insert:", innerError);
      return res.status(500).json({ error: "Internal Server Error during batch insert" });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error acquiring client for batch insert:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @swagger
 * /items/{id}:
 *   get:
 *     summary: Retrieve an item by ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: An item.
 *       404:
 *         description: Item not found.
 */
app.get('/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM items WHERE id = $1;', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /items:
 *   post:
 *     summary: Create a new item.
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
 */
app.post('/items', async (req, res) => {
  try {
    const { name, description, price } = req.body;
    const result = await pool.query(
      'INSERT INTO items (name, description, price) VALUES ($1, $2, $3) RETURNING *;',
      [name, description, price]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /items/{id}:
 *   put:
 *     summary: Update an existing item.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
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
 */
app.put('/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price } = req.body;
    const result = await pool.query(
      'UPDATE items SET name=$1, description=$2, price=$3 WHERE id=$4 RETURNING *;',
      [name, description, price, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /items/{id}:
 *   delete:
 *     summary: Delete an item.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Item deleted.
 *       404:
 *         description: Item not found.
 */
app.delete('/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM items WHERE id = $1 RETURNING *;', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json({ message: 'Item deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Retrieve a list of users.
 *     responses:
 *       200:
 *         description: A list of users.
 */
app.get('/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users;');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Retrieve a user by ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: A user.
 *       404:
 *         description: User not found.
 */
app.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM users WHERE id = $1;', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create a new user.
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
 *         description: Missing or invalid fields.
 *       500:
 *         description: Internal server error.
 */
app.post('/users', async (req, res) => {
  try {
    const { username, role, firstname, surname, password } = req.body;
    if (!username || !role || !firstname || !surname || !password) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }
    const result = await pool.query(
      'INSERT INTO users (username, role, firstname, surname, password) VALUES ($1, $2, $3, $4, $5) RETURNING *;',
      [username, role, firstname, surname, password]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(`Error creating user: ${error}`);
    res.status(500).json({ error: `Error creating user: ${error}` });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Update an existing user.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
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
 */
app.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, role, firstname, surname, password } = req.body;
    const result = await pool.query(
      'UPDATE users SET username=$1, role=$2, firstname=$3, surname=$4, password=$5 WHERE id=$6 RETURNING *;',
      [username, role, firstname, surname, password, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete a user.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User deleted.
 *       404:
 *         description: User not found.
 */
app.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING *;', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /users/validate:
 *   post:
 *     summary: Validate user credentials.
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
 *         description: Credentials are valid.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 username:
 *                   type: string
 *                 role:
 *                   type: string
 *                 token:
 *                   type: string
 *       401:
 *         description: Invalid credentials.
 */
app.post('/users/validate', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1;', [username]);
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    if (user.password !== password) return res.status(401).json({ error: 'Invalid credentials' });
    const dynamicToken = generateDynamicToken(username);
    res.json({ id: user.id, username: user.username, role: user.role, token: dynamicToken });
  } catch (error) {
    console.error('Error validating user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /user/role:
 *   post:
 *     summary: Retrieve a user's role.
 *     description: Returns the role for the user specified by the username in the request body.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *             example:
 *               username: "jdoe123"
 *     responses:
 *       200:
 *         description: User role retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 role:
 *                   type: string
 *             example:
 *               role: "admin"
 *       404:
 *         description: User not found.
 *       500:
 *         description: Internal Server Error.
 */
app.post('/user/role', async (req, res) => {
  try {
    const { username } = req.body;
    const result = await pool.query('SELECT role FROM users WHERE username = $1;', [username]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


app.listen(port, async () => {
  console.log(`Adapter API listening on http://localhost:${port}`);
  await initializeDatabase();
});

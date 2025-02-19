const express = require('express');
const router = express.Router();

router.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/', (req, res) => {
    res.send('SOAP service is running on port 5000. WSDL at /items?wsdl');
});

module.exports = router;

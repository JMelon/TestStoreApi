const express = require('express');
const soap = require('soap');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const routes = require('./routes');
const itemsService = require('./services/itemsService');

const PORT = process.env.PORT || 5000;
axios.defaults.timeout = process.env.TIMEOUT || 60000;

const wsdlPath = path.join(__dirname, 'wsdl', 'items.wsdl');
const wsdlString = fs.readFileSync(wsdlPath, 'utf8');

const app = express();
app.use(routes);

const server = app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

soap.listen(server, '/items', itemsService, wsdlString, () => {
    console.log('SOAP service initialized at http://localhost:5000/items');
});
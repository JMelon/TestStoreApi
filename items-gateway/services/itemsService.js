const axios = require('axios');
const { ValidationError, ServiceError } = require('../utils/errors');

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:3000';

const itemsService = {
    ItemsService: {
        ItemsPort: {
            GetItem: async (args) => {
                try {
                    if (!args.id || typeof args.id !== 'number') {
                        throw new ValidationError('Invalid item ID');
                    }

                    const { data } = await axios.get(`${BACKEND_API_URL}/items/${args.id}`);
                    
                    if (!data) {
                        throw new ServiceError('Item not found');
                    }

                    return {
                        item: {
                            id: data.id,
                            name: data.name,
                            description: data.description || '',
                            price: data.price
                        }
                    };
                } catch (error) {
                    console.error(`Error in GetItem: ${error.message}`);
                    if (error instanceof ValidationError) {
                        throw { Fault: { faultstring: error.message, detail: { errorcode: 400 } } };
                    }
                    if (error.response?.status === 404) {
                        throw { Fault: { faultstring: 'Item not found', detail: { errorcode: 404 } } };
                    }
                    throw { Fault: { faultstring: 'Internal server error', detail: { errorcode: 500 } } };
                }
            },
            GetItems: async (args) => {
                try {
                    const page = parseInt(args.page) || 1;
                    const limit = parseInt(args.limit) || 10;

                    if (page < 1 || limit < 1 || limit > 100) {
                        throw new ValidationError('Invalid page or limit parameters');
                    }

                    const { data } = await axios.get(`${BACKEND_API_URL}/items`, {
                        params: { page, limit }
                    });

                    return {
                        items: {
                            item: data.items.map(item => ({
                                id: item.id,
                                name: item.name,
                                description: item.description || '',
                                price: item.price
                            }))
                        },
                        page: data.page,
                        limit: data.limit,
                        total: data.total
                    };
                } catch (error) {
                    console.error(`Error in GetItems: ${error.message}`);
                    if (error instanceof ValidationError) {
                        throw { Fault: { faultstring: error.message, detail: { errorcode: 400 } } };
                    }
                    throw { Fault: { faultstring: 'Internal server error', detail: { errorcode: 500 } } };
                }
            },
        },
    },
};

module.exports = itemsService;

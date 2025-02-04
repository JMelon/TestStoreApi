const fs = require("fs");
const { faker } = require("@faker-js/faker");

// Number of items to generate
const numItems = 20000;

// Function to generate store catalog items
const generateStoreCatalog = (num) => {
    let catalog = [];
    
    for (let i = 1; i <= num; i++) {
        catalog.push({
            id: i,
            name: faker.commerce.productName(),
            description: faker.commerce.productDescription(),
            price: faker.commerce.price(0.99, 9999.99, 2)
        });
    }

    return catalog;
};

// Generate data
const catalogItems = generateStoreCatalog(numItems);

// Save to JSON file
const jsonFilePath = "store_catalog.json";
fs.writeFileSync(jsonFilePath, JSON.stringify(catalogItems, null, 4));

console.log(`Generated ${numItems} realistic store catalog items in '${jsonFilePath}'`);

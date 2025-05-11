import { readFileSync } from 'fs';

// Initialize the DOM
const indexHTML = readFileSync('src/client/resources/web/index.html', 'utf-8');
document.documentElement.innerHTML = indexHTML;

import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config();

const app = createApp();
const PORT = process.env.PORT ?? 3001;

app.listen(PORT, () => {
  console.log(`⚡ Volt API running on http://localhost:${PORT}`);
});

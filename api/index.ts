import { handle } from 'hono/vercel';
import { createApp } from '../src/server/app.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

const app = createApp();
export default handle(app);

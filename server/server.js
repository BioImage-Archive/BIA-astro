import express from 'express';
import { handler as ssrHandler } from '../dist/bioimage-archive/server/entry.mjs';

const app = express();
const base = '/bioimage-archive';
app.use(base, express.static('dist/bioimage-archive/client/'));
app.use(ssrHandler);

app.listen(8080);

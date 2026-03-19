import 'reflect-metadata';
import '../src/container';
import { createApp } from '../src/infrastructure/http/app';

const app = createApp();

export default app;

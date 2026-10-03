import './styles.css';
import { App } from './app/app';

const app = new App(document.getElementById('app')!);
if (import.meta.env.DEV) (window as unknown as { app: App }).app = app;

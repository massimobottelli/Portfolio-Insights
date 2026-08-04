// Registro interno delle rotte
const routes = {
  GET: {},
  POST: {}
};

export const router = {
  // Registra una rotta GET
  get(path, handler) {
    routes.GET[path] = handler;
  },
  
  // Registra una rotta POST
  post(path, handler) {
    routes.POST[path] = handler;
  },

  // Risolve la richiesta HTTP e la indirizza al gestore corretto
  async handle(req, res) {
    const { method, url } = req;
    const parsedUrl = new URL(url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    const handler = routes[method]?.[pathname];
    if (handler) {
      try {
        // Esegue il controller passando req, res e parametri di ricerca
        await handler(req, res, parsedUrl.searchParams);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Errore interno del server', details: error.message }));
      }
      return true; // Rotta gestita con successo
    }
    return false; // Rotta non trovata (passa ai file statici)
  }
};

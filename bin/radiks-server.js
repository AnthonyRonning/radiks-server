#!/usr/bin/env node

const express = require('express');
const next = require('next');
const expressWS = require('express-ws');

const { setup } = require('../index');

const run = () => {
/*  setup().then((RadiksController) => {
    const port = parseInt(process.env.PORT, 10) || 1260;

    const server = express();

    server.use('/radiks', RadiksController);

    server.listen(port, (err) => {
      if (err) throw err;
      console.log(`radiks-server is ready on http://localhost:${port}`);
    });
  }).catch((e) => {
    console.error('Caught an error while setting up MongoDB:', e);
  }); */
  setup().then(() => {
    const port = parseInt(process.env.PORT, 10) || 1260;

    const server = express();
    expressWS(server);

    setup().then((RadiksController) => {
      server.use('/radiks', RadiksController);

      server.use((req, res, _next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', '*');
        _next();
      });
    });

    server.listen(port, (err) => {
      if (err) throw err;
      console.log(`> Ready on http://localhost:${port}`);
    });
  }).catch((e) => {
    console.error('Caught an error while setting up MongoDB:', e);
  });
};

run();

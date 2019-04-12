const express = require('express');
const bodyParser = require('body-parser');
const request = require('request-promise');
const queryToMongo = require('query-to-mongo');
const { decorateApp } = require('@awaitjs/express');
const { verifyECDSA } = require('blockstack/lib/encryption');
const EventSource = require('eventsource');
const charge = require('lightning-charge-client')(process.env.CHARGE_URI, process.env.CHARGE_APITOKEN);
const Validator = require('../lib/validator');
const { STREAM_CRAWL_EVENT } = require('../lib/constants');
const { INVOICE_EVENT } = require('../lib/constants');

const makeModelsController = (db, emitter) => {
  const ModelsController = decorateApp(express.Router());
  ModelsController.use(bodyParser.json());
  const es = new EventSource(process.env.CHARGE_EVENTSOURCE);
  const messageDict = [];

  es.addEventListener('message', (msg) => {
    const invoice = JSON.parse(msg.data);
    console.log('Paid invoice:', invoice);
    const entry = messageDict.find(o => o.key === invoice.id);

    if (entry) {
      console.log('saving message after payment');
      db.save(entry.message).then(() => {
        emitter.emit(STREAM_CRAWL_EVENT, [entry.message]);
        console.log(`Message save: ${entry.message._id}`);
      });
    }

    emitter.emit(INVOICE_EVENT, [invoice]);
  });

  ModelsController.post('/crawl', async (req, res) => {
    const { gaiaURL } = req.body;
    const attrs = await request({
      uri: gaiaURL,
      json: true,
    });
    const validator = new Validator(db, attrs);
    try {
      validator.validate();
      await db.save(attrs);
      emitter.emit(STREAM_CRAWL_EVENT, [attrs]);

      res.json({
        success: true,
      });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  });

  ModelsController.post('/crawl/ln', async (req, res) => {
    const { gaiaURL } = req.body;
    const attrs = await request({
      uri: gaiaURL,
      json: true,
    });
    const validator = new Validator(db, attrs);
    try {
      validator.validate();
      // attrs.index = false;
      // await db.save(attrs);
      // emitter.emit(STREAM_CRAWL_EVENT, [attrs]);

      const inv = await charge.invoice(
        { msatoshi: 1000 },
      );

      console.log(`invoice ${inv.id} created with rhash=${inv.rhash}, payreq=${inv.payreq}`);

      messageDict.push({
        key: inv.id,
        message: attrs,
      });

      res.json({
        success: true,
        message: inv,
      });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  });

  ModelsController.getAsync('/ln/:id', async (req, res) => {
    console.log('trying to get ln invoice');
    const { id } = req.params;
    const invoice = await charge.fetch(id);

    emitter.emit(INVOICE_EVENT, [invoice]);
    res.json(invoice);
  });

  ModelsController.getAsync('/find', async (req, res) => {
    // req.query += '&index=true';
    const mongo = queryToMongo(req.query, {
      maxLimit: 1000,
    });

    const cursor = db.find(mongo.criteria, mongo.options);
    const results = await cursor.toArray();
    const total = await cursor.count();

    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const pageLinks = mongo.links(fullUrl.split('?')[0], total);

    res.json({
      ...pageLinks,
      total,
      results,
    });
  });

  ModelsController.getAsync('/:id', async (req, res) => {
    const { id } = req.params;
    const doc = await db.findOne({ _id: id });
    res.json(doc);
  });

  ModelsController.deleteAsync('/:id', async (req, res) => {
    try {
      const attrs = await db.findOne({ _id: req.params.id });
      const { publicKey } = await db.findOne({ _id: attrs.signingKeyId, radiksType: 'SigningKey' });
      const message = `${attrs._id}-${attrs.updatedAt}`;
      if (verifyECDSA(message, publicKey, req.query.signature)) {
        await db.deleteOne({ _id: req.params.id });
        return res.json({
          success: true,
        });
      }
    } catch (error) {
      console.error(error);
    }

    return res.json({
      success: false,
      error: 'Invalid signature',
    });
  });

  return ModelsController;
};

module.exports = makeModelsController;

const { getPublicKeyFromPrivate } = require('blockstack/lib/keys');
require('./setup');
const { models } = require('./mocks');
const getDB = require('./db');
const Signer = require('./signer');
const { COLLECTION } = require('../app/lib/constants');

const Validator = require.requireActual('../app/lib/validator');

test('it validates new models', async () => {
  const signer = new Signer();
  const db = await getDB();
  await signer.save(db);
  const model = {
    ...models.hank,
  };
  signer.sign(model);
  expect(model.radiksSignature).not.toBeFalsy();
  const validator = new Validator(db.collection(COLLECTION), model);
  expect(await validator.validate()).toEqual(true);
  expect(validator.attrs).toEqual(model);
  expect(validator.previous).toBeNull();
});

test('it doesnt allow mismatched signingKeyId', async () => {
  const signer = new Signer();
  const db = await getDB();
  await signer.save(db);
  const model = {
    ...models.hank,
  };
  signer.sign(model);
  await db.collection(COLLECTION).insertOne(model);
  let validator = new Validator(db.collection(COLLECTION), model);
  expect(await validator.validate()).toEqual(true);

  const secondSigner = new Signer();
  await secondSigner.save(db);
  secondSigner.sign(model);
  validator = new Validator(db.collection(COLLECTION), model);
  try {
    await validator.validate();
  } catch (error) {
    expect(error.message.indexOf('Invalid radiksSignature')).not.toEqual(-1);
  }
});

test('it allows changing the signing key if signed with previous signing key', async () => {
  const signer = new Signer();
  const db = await getDB();
  await signer.save(db);
  const model = {
    ...models.hank,
  };
  signer.sign(model);
  await db.collection(COLLECTION).insertOne(model);
  const secondSigner = new Signer();
  await secondSigner.save(db);
  model.signingKeyId = secondSigner._id;
  signer.sign(model);
  const validator = new Validator(db.collection(COLLECTION), model);
  expect(await validator.validate()).toEqual(true);
});

test('it doesnt allow older updatedAt', async () => {
  const model = {
    ...models.notUpdatable,
  };
  const signer = new Signer();
  const db = await getDB();
  await signer.save(db);
  signer.sign(model);
  await db.collection(COLLECTION).insertOne(model);
  signer.sign(model);
  const validator = new Validator(db.collection(COLLECTION), model);
  await expect(validator.validate()).rejects.toThrow('Tried to update a non-updatable model');
});

test('a model signing key must match the user group signing key', async () => {
  const model = {
    ...models.withGroup,
  };
  const group = {
    ...models.userGroup,
  };
  const signer = new Signer();
  const db = await getDB();
  await signer.save(db);
  await signer.sign(group);
  const groupValidator = new Validator(db.collection(COLLECTION), group);
  const modelValidator = new Validator(db.collection(COLLECTION), model);
  expect(await groupValidator.validate()).toEqual(true);
  signer.sign(model);
  expect(await modelValidator.validate()).toEqual(true);
  await db.collection(COLLECTION).insertMany([model, group]);
  const newSigner = new Signer();
  model.signingKeyId = newSigner._id;
  await newSigner.save(db);
  signer.sign(model);
  const newModelValidator = new Validator(db.collection(COLLECTION), model);
  await expect(newModelValidator.validate()).rejects.toThrow();
});

test('allows signing with new key if it matches the user group key', async () => {
  const model = {
    ...models.withGroup,
  };
  const group = {
    ...models.userGroup,
  };
  const oldSigner = new Signer();
  const db = await getDB();
  oldSigner.sign(group);
  oldSigner.sign(model);
  await db.collection(COLLECTION).insertMany([group, model]);
  const newSigner = new Signer();
  group.signingKeyId = newSigner._id;
  newSigner.sign(group);
  await db.collection(COLLECTION).save(group);
  model.signingKeyId = newSigner._id;
  newSigner.sign(model);
  await newSigner.save(db);
  const validator = new Validator(db.collection(COLLECTION), model);
  expect(await validator.validate()).toEqual(true);
});

test('allows users to use personal signing key', async () => {
  const privateKey = '476055baaef9224ad0f9d082696a35b03f0a75100948d8b76ae1e859946297dd';
  const publicKey = getPublicKeyFromPrivate(privateKey);
  const user = {
    ...models.user,
    publicKey,
  };
  const signer = new Signer(privateKey);
  const db = await getDB();
  signer.sign(user);
  const validator = new Validator(db.collection(COLLECTION), user);
  expect(await validator.validate()).toEqual(true);
});

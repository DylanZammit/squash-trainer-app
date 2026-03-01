'use strict';

/**
 * Integration tests — POST /api/signup  POST /api/login
 */

process.env.DB_PATH    = ':memory:';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../app');
const { createUser } = require('./helpers');

describe('POST /api/signup', () => {
  test('creates a user and returns a JWT + email', async () => {
    const res = await request(app)
      .post('/api/signup')
      .send({ email: 'new@test.local', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('new@test.local');
    expect(res.body.token).toBeDefined();

    const payload = jwt.decode(res.body.token);
    expect(payload.email).toBe('new@test.local');
    expect(payload.id).toBeDefined();
  });

  test('provisions default settings for the new user', async () => {
    const { token } = await createUser(app, 'defaults@test.local');
    const settings  = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${token}`);

    expect(settings.status).toBe(200);
    expect(settings.body).toMatchObject({
      min_interval: 5,
      max_interval: 15,
      session_duration: 300,
    });
  });

  test('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/signup')
      .send({ password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/signup')
      .send({ email: 'nopw@test.local' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test('returns 400 when password is shorter than 6 characters', async () => {
    const res = await request(app)
      .post('/api/signup')
      .send({ email: 'short@test.local', password: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/6 characters/i);
  });

  test('returns 409 when the email is already registered', async () => {
    await createUser(app, 'dup@test.local');
    const res = await request(app)
      .post('/api/signup')
      .send({ email: 'dup@test.local', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });
});

describe('POST /api/login', () => {
  beforeAll(async () => {
    await createUser(app, 'login@test.local', 'correctpass');
  });

  test('returns a JWT for valid credentials', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'login@test.local', password: 'correctpass' });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('login@test.local');
    expect(res.body.token).toBeDefined();
  });

  test('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ password: 'correctpass' });

    expect(res.status).toBe(400);
  });

  test('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'login@test.local' });

    expect(res.status).toBe(400);
  });

  test('returns 401 for an unknown email', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'ghost@test.local', password: 'correctpass' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  test('returns 401 for the correct email but wrong password', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'login@test.local', password: 'wrongpass' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });
});

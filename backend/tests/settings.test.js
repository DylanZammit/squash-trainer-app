'use strict';

/**
 * Integration tests — GET /api/settings  POST /api/settings
 */

process.env.DB_PATH    = ':memory:';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const app     = require('../app');
const { createUser, bearer } = require('./helpers');

let token;

beforeAll(async () => {
  ({ token } = await createUser(app, 'settings@test.local'));
});

describe('GET /api/settings', () => {
  test('returns default settings right after signup', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', bearer(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ min_interval: 5, max_interval: 15, session_duration: 300 });
  });

  test('returns 401 without a token', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/settings', () => {
  test('saves and returns valid settings', async () => {
    const res = await request(app)
      .post('/api/settings')
      .set('Authorization', bearer(token))
      .send({ min_interval: 10, max_interval: 30, session_duration: 900 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ min_interval: 10, max_interval: 30, session_duration: 900 });
  });

  test('persists: GET after POST returns the updated values', async () => {
    await request(app)
      .post('/api/settings')
      .set('Authorization', bearer(token))
      .send({ min_interval: 7, max_interval: 25, session_duration: 450 });

    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', bearer(token));

    expect(res.body).toMatchObject({ min_interval: 7, max_interval: 25, session_duration: 450 });
  });

  test('returns 400 when min_interval is missing', async () => {
    const res = await request(app)
      .post('/api/settings')
      .set('Authorization', bearer(token))
      .send({ max_interval: 20, session_duration: 300 });

    expect(res.status).toBe(400);
  });

  test('returns 400 when max_interval is missing', async () => {
    const res = await request(app)
      .post('/api/settings')
      .set('Authorization', bearer(token))
      .send({ min_interval: 5, session_duration: 300 });

    expect(res.status).toBe(400);
  });

  test('returns 400 when min_interval >= max_interval', async () => {
    const res = await request(app)
      .post('/api/settings')
      .set('Authorization', bearer(token))
      .send({ min_interval: 20, max_interval: 10, session_duration: 300 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/less than/i);
  });

  test('returns 400 when min_interval equals max_interval', async () => {
    const res = await request(app)
      .post('/api/settings')
      .set('Authorization', bearer(token))
      .send({ min_interval: 10, max_interval: 10, session_duration: 300 });

    expect(res.status).toBe(400);
  });

  test('returns 400 when values are non-positive', async () => {
    const res = await request(app)
      .post('/api/settings')
      .set('Authorization', bearer(token))
      .send({ min_interval: 0, max_interval: 10, session_duration: 300 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive/i);
  });

  test('returns 400 when values are non-integer strings', async () => {
    const res = await request(app)
      .post('/api/settings')
      .set('Authorization', bearer(token))
      .send({ min_interval: 'abc', max_interval: 10, session_duration: 300 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/integers/i);
  });

  test('returns 401 without a token', async () => {
    const res = await request(app)
      .post('/api/settings')
      .send({ min_interval: 5, max_interval: 15, session_duration: 300 });

    expect(res.status).toBe(401);
  });

  test('users cannot read each other\'s settings', async () => {
    const { token: otherToken } = await createUser(app, 'other-settings@test.local');
    await request(app)
      .post('/api/settings')
      .set('Authorization', bearer(otherToken))
      .send({ min_interval: 99, max_interval: 100, session_duration: 9999 });

    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', bearer(token));

    expect(res.body.min_interval).not.toBe(99);
  });
});

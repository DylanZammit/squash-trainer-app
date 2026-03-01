'use strict';

/**
 * Shared test helpers.
 *
 * Each test file must set process.env.DB_PATH = ':memory:' BEFORE
 * requiring this module so that every file gets its own isolated DB.
 */

const request = require('supertest');

/**
 * Register a user and return { token, email }.
 */
async function createUser(app, email = 'user@test.local', password = 'password123') {
  const res = await request(app)
    .post('/api/signup')
    .send({ email, password });
  return { token: res.body.token, email: res.body.email, status: res.status };
}

/**
 * Return an Authorization header value for the given token.
 */
function bearer(token) {
  return `Bearer ${token}`;
}

module.exports = { createUser, bearer };

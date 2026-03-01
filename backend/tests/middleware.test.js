'use strict';

/**
 * Unit tests — authenticateToken middleware
 */

process.env.DB_PATH    = ':memory:';
process.env.JWT_SECRET = 'test-secret';

const jwt = require('jsonwebtoken');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

function makeReqRes(authHeader) {
  const req = { headers: { authorization: authHeader } };
  const res = {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body)   { this._body = body;  return this; },
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('authenticateToken middleware', () => {
  test('calls next() and attaches req.user for a valid token', () => {
    const token = jwt.sign({ id: 42, email: 'a@b.com' }, JWT_SECRET, { expiresIn: '1h' });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.id).toBe(42);
    expect(req.user.email).toBe('a@b.com');
  });

  test('returns 401 when Authorization header is absent', () => {
    const { req, res, next } = makeReqRes(undefined);

    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
    expect(res._body).toMatchObject({ error: 'Access token required' });
  });

  test('returns 401 when Authorization header has no token', () => {
    const { req, res, next } = makeReqRes('Bearer ');

    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  test('returns 403 for a token signed with the wrong secret', () => {
    const token = jwt.sign({ id: 1 }, 'wrong-secret', { expiresIn: '1h' });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
    expect(res._body).toMatchObject({ error: 'Invalid or expired token' });
  });

  test('returns 403 for an expired token', () => {
    const token = jwt.sign({ id: 1 }, JWT_SECRET, { expiresIn: '-1s' });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
  });

  test('returns 403 for a malformed token string', () => {
    const { req, res, next } = makeReqRes('Bearer not.a.jwt');

    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
  });
});

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}
function ok(body) { return json(200, body); }
function badRequest(message) { return json(400, { error: message }); }
function unauthorized(message) { return json(401, { error: message || 'Unauthorized' }); }
function conflict(message) { return json(409, { error: message }); }
function notFound(message) { return json(404, { error: message || 'Not found' }); }
function serverError(message) { return json(500, { error: message || 'Server error' }); }

module.exports = { ok, badRequest, unauthorized, conflict, notFound, serverError };

import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'voltguard_super_secure_jwt_secret_key_change_me_in_prod';

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch (error) {
    return null;
  }
}

export function getUserFromRequest(request) {
  // Try reading from Authorization Header
  const authHeader = request.headers.get('authorization');
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // Fallback to cookie if headers don't have it
  if (!token) {
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      const tokenCookie = cookieHeader
        .split(';')
        .find((c) => c.trim().startsWith('token='));
      if (tokenCookie) {
        token = tokenCookie.split('=')[1];
      }
    }
  }

  if (!token) return null;
  return verifyToken(token);
}

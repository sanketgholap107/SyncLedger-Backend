import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export function generateAccessToken(userId){
    return jwt.sign({userId},JWT_SECRET,{expiresIn:JWT_EXPIRES_IN});
}

export function generateRefreshToken(userId){
    return jwt.sign({userId}, JWT_SECRET,{expiresIn:JWT_REFRESH_EXPIRES_IN});
}

export function generateTokens(userId){
    let accessToken = generateAccessToken(userId);
    let refreshToken = generateRefreshToken(userId);

    return{
        accessToken: accessToken,
        refreshToken: refreshToken
    }
}

export function verifyToken(token){
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        const wrappedError = new Error(error.message);
        wrappedError.name = error.name;
        throw wrappedError;
    }
}
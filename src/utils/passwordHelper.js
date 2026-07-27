import bcrypt from "bcrypt";

//hashPassword
export async function hashPassword(password) {
    try {
        const salt = await bcrypt.genSalt();
        const hashedPassword = await bcrypt.hash(password, salt);

        return hashedPassword;
    } catch (error) {
        throw new Error("Error Hashing Password");
    }
}

//comparePassword
export async function comparePassword(password, hashedPassword) {
    try {
        const compared = await bcrypt.compare(password, hashedPassword);

        return compared;
    } catch (error) {
        throw new Error("Incorrect Password");
    }
}

//validatePasswordStrength 
export async function validatePasswordStrength(password) {

    // The built-in .test() method is used with regular expressions (regex) to determine if a pattern exists within a given string. 

    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    const errors = [];

    if (password.length < minLength) {
        errors.push(`Password must be at least ${minLength} characters long`);
    }
    if (!hasUpperCase) {
        errors.push('Password must contain at least one uppercase letter');
    }
    if (!hasLowerCase) {
        errors.push('Password must contain at least one lowercase letter');
    }
    if (!hasNumber) {
        errors.push('Password must contain at least one number');
    }
    if (!hasSpecialChar) {
        errors.push('Password must contain at least one special character');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}
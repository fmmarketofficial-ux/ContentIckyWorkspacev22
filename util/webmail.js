const imaps = require("imap-simple");

/**
 * Se conecta directamente al servidor de correo para buscar el último OTP de Rockstar.
 * @param {string} email - El email de la cuenta.
 * @param {string} password - La contraseña de la cuenta.
 * @returns {Promise<{success: boolean, code: string|null, error: string|null}>}
 */
async function getOtpFromWebmail(email, password) {
    const config = {
        imap: {
            user: email,
            password: password,
            host: "mail.30kbatch.com",
            port: 143,
            tls: false,
            authTimeout: 10000,
        },
    };

    let connection;
    try {
        connection = await imaps.connect(config);
        await connection.openBox("INBOX");

        const searchCriteria = ["ALL", ["FROM", "Rockstar Games"]];
        const fetchOptions = { bodies: ["TEXT"] };

        const messages = await connection.search(searchCriteria, fetchOptions);

        if (messages.length === 0) {
            connection.end();
            return {
                success: false,
                code: null,
                error: "No se encontró ningún correo de Rockstar Games.",
            };
        }

        const latestMessage = messages[messages.length - 1];
        const emailText = latestMessage.parts.find(
            (part) => part.which === "TEXT",
        ).body;

        const otpMatch = emailText.match(/\b\d{6}\b/);

        connection.end();

        if (otpMatch && otpMatch[0]) {
            return { success: true, code: otpMatch[0], error: null };
        } else {
            return {
                success: false,
                code: null,
                error: "Se encontró el correo, pero no se pudo extraer un código válido.",
            };
        }
    } catch (error) {
        if (connection) connection.end();
        console.error(
            "Error en el proceso de obtener OTP (IMAP):",
            error.message,
        );
        if (error.message.includes("Invalid credentials")) {
            return {
                success: false,
                code: null,
                error: "Login fallido. Credenciales incorrectas.",
            };
        }
        return {
            success: false,
            code: null,
            error: "No se pudo conectar al servidor de correo.",
        };
    }
}

module.exports = { getOtpFromWebmail };

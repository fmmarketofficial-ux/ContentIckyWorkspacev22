const { google } = require('googleapis');

// Leemos las credenciales desde los Secrets de Replit
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
const SPREADSHEET_ID = process.env.spreadsheetId;

// Autenticación
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

/**
 * Verifica un código de autenticación y lo marca como usado.
 */
async function verifyAuthCode(code, userId) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'AUTH_CODES!A:E',
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) return { success: false, message: 'No hay códigos configurados.' };

        const rowIndex = rows.findIndex(row => row[0] === code);
        if (rowIndex === -1) return { success: false, message: 'El código introducido no es válido.' };

        const row = rows[rowIndex];
        const status = row[2];
        const expirationDate = new Date(row[1]);

        if (status !== 'activo') return { success: false, message: 'Este código ya ha sido usado o no está activo.' };
        if (expirationDate < new Date()) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID, range: `AUTH_CODES!C${rowIndex + 1}`,
                valueInputOption: 'USER_ENTERED', resource: { values: [['expirado']] },
            });
            return { success: false, message: 'Este código ha expirado.' };
        }

        const today = new Date().toISOString().slice(0, 10);
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `AUTH_CODES!C${rowIndex + 1}:E${rowIndex + 1}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [['usado', userId, today]] },
        });

        return { success: true, message: '¡Código verificado con éxito!' };
    } catch (error) {
        console.error('Error en verifyAuthCode:', error);
        return { success: false, message: 'Hubo un error al contactar con la base de datos.' };
    }
}

/**
 * Busca y asigna la primera cuenta disponible.
 */
async function getAvailableAccount(sheetName, userId) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:F`,
        });

        const rows = response.data.values;
        if (!rows || rows.length <= 1) return null;

        let availableRowIndex = -1;
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const isLocalUsed = row[0] === 'TRUE';
            const isGlobalUsed = row[1] === 'TRUE';
            if (!isLocalUsed && !isGlobalUsed) {
                availableRowIndex = i;
                break;
            }
        }

        if (availableRowIndex === -1) return null;

        const sheetRowNumber = availableRowIndex + 1;
        const accountData = {
            email: rows[availableRowIndex][2],
            pass: rows[availableRowIndex][3],
            bans: rows[availableRowIndex][4] || 'Sin baneos registrados',
        };
        
        const today = new Date().toLocaleDateString('es-ES');
        const statusMessage = `✅ Usada por ${userId} el ${today}`;
        
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A${sheetRowNumber}:F${sheetRowNumber}`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [[ 'TRUE', 'FALSE', accountData.email, accountData.pass, rows[availableRowIndex][4], statusMessage ]],
            },
        });

        return accountData;
    } catch (error) {
        console.error(`Error obteniendo cuenta de ${sheetName}:`, error);
        return null;
    }
}

/**
 * Obtiene las estadísticas desde la pestaña Dashboard.
 */
async function getDashboardStats() {
    try {
        const ranges = ['Dashboard!B3:B5', 'Dashboard!E3:E5', 'Dashboard!H3:H5'];
        const response = await sheets.spreadsheets.values.batchGet({
            spreadsheetId: SPREADSHEET_ID,
            ranges: ranges,
        });

        const [fivemData, discordData, steamData] = response.data.valueRanges;
        const parseStats = (data) => ({
            total: data.values[0][0] || 0,
            used: data.values[1][0] || 0,
            available: data.values[2][0] || 0,
        });

        return {
            fivem: parseStats(fivemData),
            discord: parseStats(discordData),
            steam: parseStats(steamData),
        };
    } catch (error) {
        console.error('Error al obtener estadísticas del Dashboard:', error);
        return null;
    }
}

module.exports = {
    verifyAuthCode,
    getAvailableAccount,
    getDashboardStats
};
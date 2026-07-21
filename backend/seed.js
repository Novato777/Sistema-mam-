const bcrypt = require('bcryptjs');
const db = require('./src/config/db');

const seed = async () => {
  try {
    // Asegurar que la tabla existe primero corriendo init
    const initDatabase = require('./src/db/init');
    await initDatabase();

    const username = 'admin';
    const rawPassword = 'adminpassword123'; // Clave por defecto sugerida

    const existingUser = await db.get('SELECT * FROM users WHERE username = ?', [username]);

    if (!existingUser) {
      console.log(`Creando usuario administrador inicial: ${username}...`);
      const hashedPassword = await bcrypt.hash(rawPassword, 10);
      await db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
      console.log('Usuario administrador creado con éxito.');
    } else {
      console.log('El usuario administrador ya existe en la base de datos.');
    }
  } catch (error) {
    console.error('Error al sembrar usuario administrador:', error);
  } finally {
    // Cerrar la base de datos para finalizar el script de forma limpia si aplica sqlite
    if (db.dbType === 'sqlite' && db.db && typeof db.db.close === 'function') {
      db.db.close();
    } else {
      process.exit(0);
    }
  }
};

seed();

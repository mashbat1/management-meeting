require('dotenv').config();
const app = require('./api/index');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  Management Meeting Q&A — DEV`);
  console.log(`========================================`);
  console.log(`  Admin    : http://localhost:${PORT}/`);
  console.log(`  Display  : http://localhost:${PORT}/display`);
  console.log(`  Ask page : http://localhost:${PORT}/ask`);
  console.log(`  Model    : ${process.env.MODEL || 'google/gemini-2.5-flash'}`);
  console.log(`========================================\n`);
  console.log(`💡 Локал тестийн үед .env-д UPSTASH_REDIS_REST_URL/TOKEN тохируулсан байх ёстой.`);
});

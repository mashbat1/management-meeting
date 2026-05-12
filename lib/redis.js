const { Redis } = require('@upstash/redis');

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const MISSING_CREDS_MSG =
  'Upstash Redis тохиргоо дутуу байна. Vercel → Settings → Environment Variables дотор UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (эсвэл KV_REST_API_URL + KV_REST_API_TOKEN) тохируулаад redeploy хийнэ үү.';

let redis;
if (url && token) {
  redis = new Redis({ url, token });
} else {
  console.error('❌ Upstash Redis credentials missing. Functions will return 503.');
  const throwErr = () => { throw new Error(MISSING_CREDS_MSG); };
  redis = {
    incr: throwErr,
    get: throwErr,
    set: throwErr,
    del: throwErr,
    rpush: throwErr,
    lrange: throwErr,
  };
}

module.exports = redis;

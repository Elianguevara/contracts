// Diagnostic (read-only): fetch the Firestore rules currently deployed in prod.
// Mints an OAuth token from the local service account using only Node built-ins.
import { readFile } from 'node:fs/promises';
import { createSign } from 'node:crypto';

const key = JSON.parse(await readFile(new URL('../serviceAccountKey.json', import.meta.url)));

function b64url(input) {
	return Buffer.from(input)
		.toString('base64')
		.replace(/=/g, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_');
}

const now = Math.floor(Date.now() / 1000);
const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
const claims = b64url(
	JSON.stringify({
		iss: key.client_email,
		scope: 'https://www.googleapis.com/auth/cloud-platform',
		aud: 'https://oauth2.googleapis.com/token',
		iat: now,
		exp: now + 3600
	})
);
const signer = createSign('RSA-SHA256');
signer.update(`${header}.${claims}`);
const signature = signer
	.sign(key.private_key)
	.toString('base64')
	.replace(/=/g, '')
	.replace(/\+/g, '-')
	.replace(/\//g, '_');
const jwt = `${header}.${claims}.${signature}`;

const tokRes = await fetch('https://oauth2.googleapis.com/token', {
	method: 'POST',
	headers: { 'content-type': 'application/x-www-form-urlencoded' },
	body: new URLSearchParams({
		grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
		assertion: jwt
	})
});
const tok = await tokRes.json();
if (!tok.access_token) {
	console.error('Token error:', tok);
	process.exit(1);
}

const project = key.project_id;
const relRes = await fetch(
	`https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`,
	{ headers: { authorization: `Bearer ${tok.access_token}` } }
);
const rel = await relRes.json();
if (!rel.rulesetName) {
	console.error('Release error:', JSON.stringify(rel, null, 2));
	process.exit(1);
}
console.log('Deployed release ->', rel.rulesetName);

const rsRes = await fetch(`https://firebaserules.googleapis.com/v1/${rel.rulesetName}`, {
	headers: { authorization: `Bearer ${tok.access_token}` }
});
const rs = await rsRes.json();
for (const f of rs.source?.files ?? []) {
	console.log(`\n----- DEPLOYED ${f.name} -----`);
	console.log(f.content);
}

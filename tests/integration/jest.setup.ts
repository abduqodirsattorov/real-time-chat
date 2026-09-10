import axios from 'axios';
import * as http from 'http';
import * as https from 'https';

const httpAgent = new http.Agent({ keepAlive: false });
const httpsAgent = new https.Agent({ keepAlive: false });

axios.defaults.httpAgent = httpAgent;
axios.defaults.httpsAgent = httpsAgent;
axios.defaults.headers.common['Connection'] = 'close';

afterAll(() => {
  httpAgent.destroy();
  httpsAgent.destroy();
});

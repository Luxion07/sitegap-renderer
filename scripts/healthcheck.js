const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, '../proto/grpc/health/v1/health.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDefinition);
const HealthService = proto.grpc.health.v1.Health;

const address = process.env.RENDERER_ADDRESS || '127.0.0.1:50051';
const client = new HealthService(address, grpc.credentials.createInsecure());

const deadline = new Date(Date.now() + 3000);

client.check({ service: '' }, { deadline }, (err, response) => {
  client.close();
  if (err) {
    process.exit(1);
  }
  if (response.status === 'SERVING' || response.status === 1) {
    process.exit(0);
  }
  process.exit(1);
});

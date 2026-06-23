module.exports = {
  apps: [
    {
      name: "sambah-xeriffe",
      script: "src/server.js",
      env: {
        PORT: "3000",
        NODE_ENV: "production"
      }
    }
  ]
};

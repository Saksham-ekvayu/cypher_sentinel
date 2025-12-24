const { getRegisteredRoutes } = require("./routeRegistry");

// Define request body schemas for different endpoints
const getRequestBodySchema = (path, method) => {
  const upperMethod = method.toUpperCase();

  if (upperMethod === "GET" || upperMethod === "DELETE") {
    return null; // GET and DELETE typically don't have request bodies
  }

  // Auth endpoints
  if (path.includes("/register")) {
    return {
      name: "string",
      email: "string",
      password: "string",
      phone: "string (optional)",
    };
  }

  if (path.includes("/login")) {
    return {
      email: "string",
      password: "string",
    };
  }

  if (path.includes("/verify-otp")) {
    return {
      email: "string",
      otp: "string",
    };
  }

  if (path.includes("/resend-otp") || path.includes("/forgot-password")) {
    return {
      email: "string",
    };
  }

  if (path.includes("/reset-password")) {
    return {
      email: "string",
      otp: "string",
      password: "string",
    };
  }

  // User endpoints
  if (path.includes("/user") && upperMethod === "POST") {
    return {
      name: "string",
      email: "string",
      role: "string (optional)",
      phone: "string (optional)",
    };
  }

  if (path.includes("/user") && upperMethod === "PUT") {
    return {
      name: "string (optional)",
      email: "string (optional)",
      phone: "string (optional)",
    };
  }

  // Default for unknown endpoints
  return {
    data: "string",
    field: "string",
  };
};

function listRoutes() {
  const routes = [];

  const registered = getRegisteredRoutes();

  registered.forEach(({ basePath, router }) => {
    router.stack.forEach((layer) => {
      if (!layer.route) return;

      const methods = Object.keys(layer.route.methods).map((m) =>
        m.toUpperCase()
      );

      const fullPath = `${basePath}${layer.route.path}`;

      methods.forEach((method) => {
        const body = getRequestBodySchema(fullPath, method);

        routes.push({
          path: fullPath,
          method: method,
          body: body,
          headers:
            method === "POST" || method === "PUT"
              ? {
                  "Content-Type": "application/json",
                }
              : null,
        });
      });
    });
  });

  return routes;
}

module.exports = listRoutes;

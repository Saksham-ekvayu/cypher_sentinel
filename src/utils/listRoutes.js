const { getRegisteredRoutes } = require("./routeRegistry");
const fs = require("fs");
const path = require("path");

// Automatically discover all controller files
const discoverControllerFiles = () => {
  const controllersDir = path.join(__dirname, "../controllers");
  const controllerFiles = {};

  try {
    if (!fs.existsSync(controllersDir)) {
      return controllerFiles;
    }

    const files = fs.readdirSync(controllersDir);

    files.forEach((file) => {
      if (file.endsWith(".controller.js")) {
        // Extract controller name from filename (e.g., 'auth.controller.js' -> 'auth')
        const controllerName = file.replace(".controller.js", "");
        const filePath = path.join(controllersDir, file);

        // Map to API path (e.g., 'auth' -> '/api/auth')
        controllerFiles[`/api/${controllerName}`] = filePath;
      }
    });

    console.log(
      "🔍 Auto-discovered controllers:",
      Object.keys(controllerFiles)
    );
    return controllerFiles;
  } catch (error) {
    console.error("Error discovering controller files:", error);
    return controllerFiles;
  }
};

// Automatically extract all function names from a controller file
const extractFunctionNames = (controllerContent) => {
  const functionNames = [];

  // Patterns to match different function declaration styles
  const patterns = [
    // const functionName = async (req, res) => {
    /const\s+(\w+)\s*=\s*async\s*\([^)]*\)\s*=>/g,
    // const functionName = (req, res) => {
    /const\s+(\w+)\s*=\s*\([^)]*\)\s*=>/g,
    // async function functionName(req, res) {
    /async\s+function\s+(\w+)\s*\([^)]*\)/g,
    // function functionName(req, res) {
    /function\s+(\w+)\s*\([^)]*\)/g,
  ];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(controllerContent)) !== null) {
      const funcName = match[1];
      if (!functionNames.includes(funcName)) {
        functionNames.push(funcName);
      }
    }
  });

  return functionNames;
};

// Helper functions
const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

const toCamelCase = (str) => {
  return str.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
};

// Simple Levenshtein distance for fuzzy matching
const levenshteinDistance = (str1, str2) => {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
};

// Smart function name matching based on route path and HTTP method
const findMatchingFunction = (routePath, method, availableFunctions) => {
  const pathParts = routePath.split("/").filter((part) => part);
  const lastPart = pathParts[pathParts.length - 1];
  const secondLastPart = pathParts[pathParts.length - 2];

  // Convert method to action patterns
  const methodActions = {
    GET: ["get", "fetch", "retrieve", "list", "show", "find"],
    POST: ["create", "add", "register", "login", "send", "verify", "resend"],
    PUT: ["update", "edit", "modify", "change"],
    DELETE: ["delete", "remove", "destroy"],
    PATCH: ["patch", "update", "modify"],
  };

  // Try exact matches first
  const exactMatches = [
    lastPart, // e.g., 'register' -> 'register'
    `${method.toLowerCase()}${capitalize(lastPart)}`, // e.g., 'postRegister'
    `${lastPart}${capitalize(method)}`, // e.g., 'registerPost'
  ];

  for (const exactMatch of exactMatches) {
    const found = availableFunctions.find(
      (func) => func.toLowerCase() === exactMatch.toLowerCase()
    );
    if (found) return found;
  }

  // Try pattern-based matching
  const patterns = [
    // Common patterns
    lastPart, // 'register'
    `${lastPart}User`, // 'registerUser'
    `${lastPart}${capitalize(secondLastPart)}`, // 'registerAuth'

    // Method-based patterns
    ...methodActions[method].map(
      (action) => `${action}${capitalize(lastPart)}`
    ),
    ...methodActions[method].map(
      (action) => `${action}${capitalize(secondLastPart)}`
    ),

    // Special cases
    lastPart.replace(/-/g, ""), // 'verify-otp' -> 'verifyotp'
    toCamelCase(lastPart), // 'verify-otp' -> 'verifyOtp'
    `${method.toLowerCase()}${toCamelCase(lastPart)}`, // 'postVerifyOtp'
  ];

  // Add common variations
  if (lastPart.includes("-")) {
    patterns.push(toCamelCase(lastPart));
  }

  // Special route handling
  if (routePath.includes("/user")) {
    if (method === "GET" && (lastPart === "all-users" || !lastPart)) {
      patterns.unshift("getAllUsers", "getUsers", "listUsers");
    }
    if (method === "POST" && !lastPart) {
      patterns.unshift("createUserByAdmin", "createUser", "addUser");
    }
    if (method === "PUT") {
      patterns.unshift("editProfile", "updateProfile", "updateUser");
    }
    if (method === "DELETE") {
      patterns.unshift("deleteUser", "removeUser");
    }
  }

  // Try fuzzy matching
  for (const pattern of patterns) {
    const found = availableFunctions.find((func) => {
      const funcLower = func.toLowerCase();
      const patternLower = pattern.toLowerCase();

      return (
        funcLower === patternLower ||
        funcLower.includes(patternLower) ||
        patternLower.includes(funcLower) ||
        levenshteinDistance(funcLower, patternLower) <= 2
      );
    });

    if (found) {
      console.log(
        `🎯 Matched ${routePath} ${method} -> ${found} (pattern: ${pattern})`
      );
      return found;
    }
  }

  return null;
};

// Automatically extract request body fields from controller functions
const extractRequestBodyFromController = (routePath, method) => {
  try {
    // Auto-discover controller files
    const controllerMap = discoverControllerFiles();

    // Find the appropriate controller file
    let controllerFile = null;
    for (const [basePath, filePath] of Object.entries(controllerMap)) {
      if (routePath.startsWith(basePath)) {
        controllerFile = filePath;
        break;
      }
    }

    if (!controllerFile || !fs.existsSync(controllerFile)) {
      return null;
    }

    // Read controller file content
    const controllerContent = fs.readFileSync(controllerFile, "utf8");

    // Extract all available function names
    const availableFunctions = extractFunctionNames(controllerContent);

    if (availableFunctions.length === 0) {
      return null;
    }

    // Smart function matching
    const functionName = findMatchingFunction(
      routePath,
      method,
      availableFunctions
    );

    if (!functionName) {
      console.log(
        `❌ No function found for ${method} ${routePath}. Available functions:`,
        availableFunctions
      );
      return null;
    }

    // Find the function in the controller content - improved with multiple patterns
    const functionPatterns = [
      // const functionName = async (req, res) => {
      new RegExp(
        `const\\s+${functionName}\\s*=\\s*async\\s*\\([^)]*\\)\\s*=>\\s*{([\\s\\S]*?)^};`,
        "gm"
      ),
      // const functionName = (req, res) => {
      new RegExp(
        `const\\s+${functionName}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*{([\\s\\S]*?)^};`,
        "gm"
      ),
      // async function functionName(req, res) {
      new RegExp(
        `async\\s+function\\s+${functionName}\\s*\\([^)]*\\)\\s*{([\\s\\S]*?)^}`,
        "gm"
      ),
      // function functionName(req, res) {
      new RegExp(
        `function\\s+${functionName}\\s*\\([^)]*\\)\\s*{([\\s\\S]*?)^}`,
        "gm"
      ),
      // exports.functionName = async (req, res) => {
      new RegExp(
        `exports\\.${functionName}\\s*=\\s*async\\s*\\([^)]*\\)\\s*=>\\s*{([\\s\\S]*?)^};`,
        "gm"
      ),
    ];

    let functionBody = null;

    for (const pattern of functionPatterns) {
      const match = pattern.exec(controllerContent);
      if (match) {
        functionBody = match[1];
        console.log(
          `✅ Found function '${functionName}' for ${method} ${routePath}`
        );
        break;
      }
    }

    if (!functionBody) {
      console.log(
        `❌ Function '${functionName}' not found in controller for ${method} ${routePath}`
      );
      return null;
    }

    // Extract req.body destructuring patterns with better parsing
    const destructuringPatterns = [
      /const\s*{\s*([^}]+)\s*}\s*=\s*req\.body/g,
      /{\s*([^}]+)\s*}\s*=\s*req\.body/g,
    ];

    let extractedFields = [];

    for (const pattern of destructuringPatterns) {
      let match;
      while ((match = pattern.exec(functionBody)) !== null) {
        const fieldsString = match[1];
        console.log(`🔍 Raw destructuring match: "${fieldsString}"`);

        // Split by comma and clean each field
        const fields = fieldsString
          .split(",")
          .map((field) => {
            // Remove whitespace and extract just the variable name
            let cleanField = field.trim();

            // Handle destructuring with renaming: { name: newName } -> name
            if (cleanField.includes(":")) {
              cleanField = cleanField.split(":")[0].trim();
            }

            // Handle destructuring with default values: { name = 'default' } -> name
            if (cleanField.includes("=")) {
              cleanField = cleanField.split("=")[0].trim();
            }

            return cleanField;
          })
          .filter((field) => {
            // Only keep valid JavaScript identifiers and exclude comments
            const isValid =
              field &&
              !field.includes("//") &&
              !field.includes("/*") &&
              /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(field);

            if (field) {
              console.log(
                `🔍 Field "${field}" is ${isValid ? "valid" : "invalid"}`
              );
            }
            return isValid;
          });

        console.log(`✅ Extracted fields:`, fields);
        extractedFields = extractedFields.concat(fields);
      }
    }

    if (extractedFields.length === 0) {
      return null;
    }

    // Convert to schema object
    const schema = {};
    extractedFields.forEach((field) => {
      // Determine if field is optional by checking if it's used in conditionals
      const isOptional =
        functionBody.includes(`if (${field})`) ||
        functionBody.includes(`${field} ?`) ||
        functionBody.includes(`${field} &&`) ||
        functionBody.includes(`${field} ||`);

      schema[field] = isOptional ? "string (optional)" : "string";
    });

    console.log(
      `✅ Auto-extracted schema for ${method} ${routePath} -> ${functionName}:`,
      schema
    );
    return schema;
  } catch (error) {
    console.error("Error extracting request body schema:", error);
    return null;
  }
};

// Main function to get request body schema - 100% auto-detection
const getRequestBodySchema = (path, method) => {
  // Only use auto-detection - no fallbacks needed
  const autoSchema = extractRequestBodyFromController(path, method);

  if (autoSchema && Object.keys(autoSchema).length > 0) {
    return autoSchema;
  }

  // If no schema detected, it's expected for GET/DELETE or endpoints without req.body
  const upperMethod = method.toUpperCase();
  if (upperMethod === "GET" || upperMethod === "DELETE") {
    return null; // Expected - these methods don't typically have request bodies
  }

  console.log(
    `ℹ️ No request body schema detected for ${method} ${path} - endpoint may not use req.body`
  );
  return null;
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

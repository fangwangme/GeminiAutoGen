export const createBddIt = (itFn) => (title, fn) =>
  itFn(title, async (context) => {
    if (process.env.BDD_VERBOSE === "1") {
      for (const segment of title.split(", ")) {
        const line = segment.trim();
        if (line) {
          console.log(`[BDD] ${line}`);
        }
      }
    }
    return fn(context);
  });

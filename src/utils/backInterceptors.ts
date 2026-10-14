type Interceptor = () => boolean;
const stack: Interceptor[] = [];

export function registerBackInterceptor(fn: Interceptor) {
  stack.push(fn);
  return () => {
    const i = stack.lastIndexOf(fn);
    if (i !== -1) stack.splice(i, 1);
  };
}

export function runBackInterceptors() {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i]()) return true;
  }
  return false;
}

// the numbers the shell runs on, in one place

/** how long the live server gets to print its address, ms */
export const SERVER_START_LIMIT_MS = 20000;
/** how long a stopping server gets to exit before its process tree is ended, ms */
export const SERVER_STOP_WAIT_MS = 8000;
/** stderr lines kept to explain a server that would not start */
export const SERVER_ERROR_LINES = 12;
/** child output lines shown in the message when the server would not start */
export const PROBLEM_LINES = 5;

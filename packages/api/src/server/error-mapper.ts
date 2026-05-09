type HttpErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 500 | 501 | 502 | 503;

type ErrorMapping = {
  error: { isInstance: (input: unknown) => boolean };
  status: HttpErrorStatus;
};

export const createErrorMapper = (mappings: ErrorMapping[]) => {
  return (error: unknown): { status: HttpErrorStatus; payload: { message: string } } | null => {
    for (const mapping of mappings) {
      if (mapping.error.isInstance(error)) {
        const msg =
          (error as { data?: { message?: string } }).data?.message ??
          (error as Error).message ??
          "Unknown error";
        return { status: mapping.status, payload: { message: msg } };
      }
    }
    return null;
  };
};

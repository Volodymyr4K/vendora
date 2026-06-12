export type SecretResolver = {
  resolve: (ref: string) => string | undefined;
};

export function envSecretResolver(): SecretResolver {
  return {
    resolve: (ref: string) => process.env[ref],
  };
}


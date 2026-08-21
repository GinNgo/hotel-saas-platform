import { ValidatorFn, Validators } from '@angular/forms';

export const PASSWORD_POLICY = Object.freeze({
  minLength: 8,
  maxLength: 256,
});

export function isPasswordLengthValid(password: string | null | undefined): boolean {
  const length = password?.length ?? 0;
  return length >= PASSWORD_POLICY.minLength && length <= PASSWORD_POLICY.maxLength;
}

export function passwordValidators(): ValidatorFn[] {
  return [
    Validators.required,
    Validators.minLength(PASSWORD_POLICY.minLength),
    Validators.maxLength(PASSWORD_POLICY.maxLength),
  ];
}

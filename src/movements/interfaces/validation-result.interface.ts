import { ValidationReason } from './validation-reason.interface';

export interface ValidationResult {
  isValid: boolean;
  reasons: ValidationReason[];
}

export interface ValidationSuccessResponse {
  message: 'Accepted';
}

export interface ValidationFailureResponse {
  message: 'Validation failed';
  reasons: ValidationReason[];
}

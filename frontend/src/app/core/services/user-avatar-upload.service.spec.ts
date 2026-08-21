import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { AvatarUploadResponse, UserService } from './user';

describe('UserService avatar upload', () => {
  let service: UserService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [UserService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UserService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('sends multipart data and preserves verified image metadata from the API', () => {
    const file = new File(['png-bytes'], 'avatar.png', { type: 'image/png' });
    const response: AvatarUploadResponse = {
      url: '/api/public/uploads/avatar-41-known.png',
      contentType: 'image/png',
      width: 256,
      height: 256,
    };
    let received: AvatarUploadResponse | undefined;

    service.uploadAvatar(file).subscribe((value) => (received = value));

    const request = httpTesting.expectOne(`${environment.apiUrl}/uploads/image`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeInstanceOf(FormData);
    expect((request.request.body as FormData).get('file')).toBe(file);
    request.flush(response);

    expect(received).toEqual(response);
  });
});

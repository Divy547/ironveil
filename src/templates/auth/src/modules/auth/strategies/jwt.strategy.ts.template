import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PassportStrategy,
} from '@nestjs/passport';
import {
  ExtractJwt,
  Strategy,
} from 'passport-jwt';
import type {
  JwtPayload,
} from '../types/jwt-payload.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(
  Strategy,
) {
  constructor(
    configService: ConfigService,
  ) {
    const secret =
      configService.get<string>(
        'auth.jwtSecret',
      );

    if (!secret) {
      throw new Error(
        'JWT_SECRET is required when JWT authentication is enabled.',
      );
    }

    super({
      jwtFromRequest:
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
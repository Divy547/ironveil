import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(
    dto: RegisterDto,
  ): Promise<{
    id: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const email = dto.email.trim().toLowerCase();

    const existingUser =
      await this.prisma.user.findUnique({
        where: { email },
      });

    if (existingUser) {
      throw new ConflictException(
        'A user with this email already exists.',
      );
    }

    const passwordHash =
      await bcrypt.hash(dto.password, 12);

    return this.prisma.user.create({
      data: {
        email,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async login(
    dto: LoginDto,
  ): Promise<{
    accessToken: string;
  }> {
    const email = dto.email.trim().toLowerCase();

    const user =
      await this.prisma.user.findUnique({
        where: { email },
      });

    if (!user) {
      throw new UnauthorizedException(
        'Invalid email or password.',
      );
    }

    const passwordMatches =
      await bcrypt.compare(
        dto.password,
        user.passwordHash,
      );

    if (!passwordMatches) {
      throw new UnauthorizedException(
        'Invalid email or password.',
      );
    }

    const accessToken =
      this.jwtService.sign({
        sub: user.id,
        email: user.email,
      });

    return {
      accessToken,
    };
  }
}
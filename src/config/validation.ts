import { plainToInstance } from 'class-transformer';
import {
    IsEnum,
    IsOptional,
    IsString,
    IsNumber,
    Min,
    Max,
    validateSync,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum Environment {
    Development = 'development',
    Production = 'production',
    Test = 'test',
}

export class EnvironmentVariables {
    @IsEnum(Environment)
    @IsOptional()
    NODE_ENV: Environment = Environment.Development;

    @Transform(({ value }: { value: string }) => parseInt(value, 10))
    @IsNumber()
    @Min(1)
    @Max(65535)
    @IsOptional()
    PORT: number = 3000;

    @IsString()
    DATABASE_URL: string;

    @IsString()
    JWT_SECRET: string;

    @IsString()
    @IsOptional()
    LOG_LEVEL: string = 'info';
}

export function validate(config: Record<string, unknown>) {
    const validatedConfig = plainToInstance(EnvironmentVariables, config, {
        enableImplicitConversion: true,
    });
    const errors = validateSync(validatedConfig, {
        skipMissingProperties: false,
    });

    if (errors.length > 0) {
        throw new Error(errors.toString());
    }
    return validatedConfig;
}

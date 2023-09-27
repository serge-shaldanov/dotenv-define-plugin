import { DefinePlugin, WebpackError, Compiler } from 'webpack';
import { parse, DotenvParseOutput } from 'dotenv';
import { existsSync, readFileSync } from 'fs';

export interface DotEnvDefinePluginOptions {
    variables: string | DotEnvVariableInfo | string[] | DotEnvVariableInfo[];
    envFilePath?: string;
    variablePrefix?: string;
    isStrictMode?: boolean;
}

export interface DotEnvVariableInfo {
    name: string;
    type?: DotEnvVariableType;
    defaultValue?: any;
}

export enum DotEnvVariableType {
    Unknown = 'Unknown',
    String = 'String',
    Integer = 'Integer',
    Float = 'Float',
    Boolean = 'Boolean'
}

export class DotEnvDefinePlugin {
    public static readonly Name: string = 'DotEnvDefinePlugin';

    public static readonly DefaultEnvFilePath: string = '.env';

    private readonly _envFilePath: string;

    private readonly _variablePrefix: string;

    private readonly _variableInfos: DotEnvVariableInfo[];

    private readonly _isStrictMode: boolean;

    public constructor(options: DotEnvDefinePluginOptions) {
        this._envFilePath = (options && Utilities.isString(options.envFilePath) && options.envFilePath) || DotEnvDefinePlugin.DefaultEnvFilePath;
        this._variablePrefix = (options && Utilities.isString(options.variablePrefix) && options.variablePrefix) || '';
        this._isStrictMode = (options && Utilities.isBoolean(options.isStrictMode) && options.isStrictMode) || false;

        this._variableInfos = [];

        if (options && options.variables) {
            if (Array.isArray(options.variables)) {
                this._variableInfos.push(...options.variables.map(Utilities.toDotEnvVariableInfo));
            } else {
                this._variableInfos.push(Utilities.toDotEnvVariableInfo(options.variables));
            }
        }
    }

    /**
     * Apply the plugin
     */
    public apply(compiler: Compiler): void {
        if (this._variableInfos.length === 0) {
            return;
        }

        let parsedEnv: DotenvParseOutput | undefined = undefined;

        try {
            parsedEnv = this.parseEnvFile();
        } catch (error: any) {
            this.registerCompileError(compiler, 'ParseDotEnvFileError', `Failed to parse .env file:\n${JSON.stringify(error)}`);
            return;
        }

        const definitions: Record<string, any> = {};

        for (const info of this._variableInfos) {
            const rawValue = parsedEnv[info.name];
            const fullVariableName = `${this._variablePrefix}${info.name}`;

            if (rawValue !== undefined) {
                definitions[fullVariableName] = this.parseVariableValue(info, rawValue);
                continue;
            }

            if (info.defaultValue !== undefined) {
                definitions[fullVariableName] = info.defaultValue;
                continue;
            }

            if (this._isStrictMode) {
                this.registerCompileError(
                    compiler,
                    'EnvVariableNotDefinedError',
                    `"${info.name}" variable is not defined.\nPlease provide a default value to avoid this warning.`
                );
            }

            definitions[fullVariableName] = undefined;
        }

        new DefinePlugin(definitions).apply(compiler);
    }

    private parseEnvFile(): DotenvParseOutput {
        if (!existsSync(this._envFilePath)) {
            if (this._isStrictMode) {
                throw new Error(`Failed to find the specified .env file. Please make sure it exists at path "${this._envFilePath}".`);
            }

            return {};
        }

        const envFileAsText = readFileSync(this._envFilePath, 'utf8');

        return parse(envFileAsText);
    }

    private registerCompileError(compiler: Compiler, errorName: string, errorMessage: string): void {
        compiler.hooks.thisCompilation.tap(DotEnvDefinePlugin.Name, compilation => {
            const error = new WebpackError(`${DotEnvDefinePlugin.Name} - ${errorMessage}`);
            error.name = errorName;

            compilation.errors.push(error);
        });
    }

    private parseVariableValue(variableInfo: DotEnvVariableInfo, rawValue: string): any {
        const variableType = variableInfo.type || DotEnvVariableType.Unknown;

        switch (variableType) {
            case DotEnvVariableType.String: {
                return JSON.stringify(Utilities.parseStringValue(rawValue));
            }

            case DotEnvVariableType.Integer: {
                return Utilities.parseIntegerValue(rawValue);
            }

            case DotEnvVariableType.Float: {
                return Utilities.parseFloatValue(rawValue);
            }

            case DotEnvVariableType.Boolean: {
                return Utilities.parseBooleanValue(rawValue);
            }

            case DotEnvVariableType.Unknown: {
                return rawValue;
            }
        }
    }
}

class Utilities {
    public static toDotEnvVariableInfo(value: any): DotEnvVariableInfo {
        if (Utilities.isString(value)) {
            return {
                name: value,
                type: DotEnvVariableType.Unknown,
                defaultValue: undefined
            };
        }

        if (Utilities.isDotEnvVariableInfo(value)) {
            return value;
        }

        throw new TypeError(`Unsupported value type. Expected type is string or DotEnvVariableInfo, but got "${value}" value.`);
    }

    public static isDotEnvVariableInfo(value: any): value is DotEnvVariableInfo {
        return value
            && value.name
            && Utilities.isString(value.name);
    }

    public static isString(value: any): value is string {
        return value instanceof String || typeof value === 'string';
    }

    public static isBoolean(value: any): value is boolean {
        return value instanceof Boolean || typeof value === 'boolean';
    }

    public static parseStringValue(value: string): string | null | undefined {
        if (value === undefined) {
            return undefined;
        }

        if (value === null) {
            return null;
        }

        return String(value);
    }

    public static parseIntegerValue(value: string): number | null | undefined {
        if (value === undefined) {
            return undefined;
        }

        if (value === null) {
            return null;
        }

        return parseInt(value, 10);
    }

    public static parseFloatValue(value: string): number | null | undefined {
        if (value === undefined) {
            return undefined;
        }

        if (value === null) {
            return null;
        }

        return parseFloat(value);
    }

    public static parseBooleanValue(value: string): boolean | null | undefined {
        if (value === undefined) {
            return undefined;
        }

        if (value === null) {
            return null;
        }

        const booleanValue = value.toLowerCase();

        switch (booleanValue) {
            case 'true':
            case 'on':
            case 'enabled':
            case 'enable':
            case 'yes':
            case '1': {
                return true;
            }

            case 'false':
            case 'off':
            case 'disabled':
            case 'disable':
            case 'no':
            case '0': {
                return false;
            }

            default: {
                return undefined;
            }
        }
    }
}
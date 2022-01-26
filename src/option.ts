import { __, match } from 'ts-pattern';

export interface Options {
    unary_rpc_promise: boolean;
    grpc_package: string;
    style: 'grpc-js'|'async';
}

export function parseInput(raw?: string): Options
{
    if (!raw)
    {
        raw = '';
    }

    const options: Options = {
        unary_rpc_promise: false,
        grpc_package: "@grpc/grpc-js",
        style: 'grpc-js',
    };

    for (const [ k, v ] of raw.split(',').map(o => o.split('=', 2)).filter(([ k ]) => options.hasOwnProperty(k)) as [ keyof Options, string ][])
    {
        (options[k] as Options[keyof Options]) = match<string, Options[keyof Options]>(typeof options[k])
            .with('boolean', () => v !== 'false')
            .with(__, () => v)
            .run();
    }

    return options;
}

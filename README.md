# @vinsjo/use-axios

`@vinsjo/use-axios` is a react hook for making HTTP requests with [Axios](https://axios-http.com)

Package is bundled using [microbundle](https://www.npmjs.com/package/microbundle)

## Installation

`npm i @vinsjo/use-axios`

## Usage

```js
const { data, loading, error } = useAxios({
    url: 'http://example.com/api',
});
```

### With TypeScript

```ts
const { data, loading, error } = useAxios<{ message: string }>({
    url: 'http://example.com/api',
});
```

## Example

```ts
import useAxios from '@vinsjo/use-axios';

const Example = () => {
    const { data, loading, error } = useAxios<{ message: string }>({
        url: 'http://example.com/api',
    });
    return (
        <>
            {data
                ? data.message
                : error
                ? error.message
                : loading
                ? 'Loading...'
                : null}
        </>
    );
};
```

// Based on https://usehooks-ts.com/react-hook/use-fetch
/* eslint-disable no-mixed-spaces-and-tabs */
/* eslint-disable react-hooks/exhaustive-deps */
import {
	useState,
	useEffect,
	useRef,
	useReducer,
	useCallback,
	useMemo,
} from 'react';
import { isEqual } from 'x-is-equal';
import axios from 'axios';
import { AxiosRequestConfig, AxiosError, AxiosResponse } from 'axios';

interface State<T, D> {
	response?: AxiosResponse<T, D>;
	error?: Error | AxiosError<T, D>;
	loading: boolean;
}

export type Action<T, D> =
	| { type: 'loading' }
	| { type: 'response'; payload: AxiosResponse<T, D> }
	| { type: 'error'; payload: Error | AxiosError<T, D> };

export type Cache<T, D> = {
	[url: string]: {
		config: AxiosRequestConfig<D>;
		response: AxiosResponse<T, D>;
	};
};
/**
 *
 * @param initialConfig AxiosRequestConfig object.
 * Can be updated with updateConfig function
 * @param reloadLimit
 * Limit how often reload function can be triggered, in milliseconds.
 * Default is 500
 * @param waitUntilMount
 * Wait until componentDidMount is invoked to execute axios request.
 * Set to true to prevent executing request twice when React.Strictmode is on.
 * Default value is false.
 */
function useAxios<T = unknown, D = unknown>(
	initialConfig: AxiosRequestConfig<D>,
	reloadLimit = 500,
	waitUntilMount = false
) {
	const [config, setConfig] = useState(initialConfig);
	const [didMount, setDidMount] = useState(false);

	const [forceReload, setForceReload] = useState(0);
	const cache = useRef<Cache<T, D>>({});

	const initialState: State<T, D> = {
		response: undefined,
		error: undefined,
		loading: false,
	};

	const stateReducer = (
		state: State<T, D>,
		action: Action<T, D>
	): State<T, D> => {
		switch (action.type) {
			case 'loading':
				return { ...initialState, loading: true };
			case 'response':
				return { ...initialState, response: action.payload };
			case 'error':
				console.log('error');
				return { ...initialState, error: action.payload };
			default:
				return state;
		}
	};
	const [{ response, loading, error }, dispatch] = useReducer(
		stateReducer,
		initialState
	);

	useEffect(() => {
		if (waitUntilMount && !didMount) return setDidMount(true);
		if (typeof config.url !== 'string') return;
		const cached = cache.current[config.url];
		// Only fetch from cache if config hasn't changed
		if (cached && isEqual(cached.config, config)) {
			dispatch({
				type: 'response',
				payload: cached.response,
			});
			return;
		}
		const controller = config.signal ? null : new AbortController();
		(async () => {
			try {
				if (typeof config.url !== 'string') return;
				dispatch({ type: 'loading' });
				const res = await axios(
					!controller
						? config
						: { ...config, signal: controller.signal }
				);
				cache.current[config.url] = { response: res, config };
				dispatch({
					type: 'response',
					payload: res,
				});
			} catch (err: Error | AxiosError | unknown) {
				if (axios.isCancel(err)) return;
				dispatch({
					type: 'error',
					payload: err as Error | AxiosError<T, D>,
				});
			}
		})();
		return () => controller?.abort();
	}, [config, didMount, forceReload]);

	const reload = useCallback(() => {
		if (typeof config.url !== 'string') return;
		delete cache.current[config.url];
		setForceReload(
			!reloadLimit || typeof reloadLimit !== 'string'
				? Date.now()
				: Math.floor(Date.now() / reloadLimit)
		);
	}, [cache, config, setForceReload, reloadLimit]);

	const updateConfig = useCallback(
		(updatedConfig: AxiosRequestConfig) => setConfig(updatedConfig),
		[config, setConfig]
	);
	return useMemo(
		() => ({
			data: !response ? null : response.data,
			loading,
			error,
			response,
			reload,
			updateConfig,
		}),
		[response, loading, error, reload, updateConfig]
	);
}

export default useAxios;

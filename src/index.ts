// Based on https://usehooks-ts.com/react-hook/use-fetch
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

function useUpdatedConfig<D>(config: AxiosRequestConfig<D>) {
	const ref = useRef<AxiosRequestConfig<D>>(config);
	useEffect(() => {
		if (!config || (ref.current && isEqual(config, ref.current))) return;
		ref.current = config;
	}, [config]);
	return useMemo(
		() => (ref.current !== undefined ? ref.current : config),
		[ref, config]
	);
}

function useAxios<T = unknown, D = unknown>(
	axiosConfig: AxiosRequestConfig<D>,
	reloadLimit = 500
) {
	const config = useUpdatedConfig(axiosConfig);
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
		if (!didMount) return setDidMount(true);
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
		const controller = new AbortController();
		(async () => {
			if (typeof config.url !== 'string') return;
			dispatch({ type: 'loading' });
			try {
				const res = await axios({
					...config,
					signal: controller.signal,
				});
				cache.current[config.url] = { response: res, config };
				dispatch({
					type: 'response',
					payload: res,
				});
			} catch (err: Error | AxiosError | unknown) {
				if (axios.isCancel(err)) return console.log('cancel error');
				dispatch({
					type: 'error',
					payload: err as Error | AxiosError<T, D>,
				});
			}
		})();
		return () => controller.abort();
	}, [didMount, config, forceReload]);

	const reload = useCallback(() => {
		if (typeof config.url !== 'string') return;
		delete cache.current[config.url];
		setForceReload(
			!reloadLimit || typeof reloadLimit !== 'string'
				? Date.now()
				: Math.floor(Date.now() / reloadLimit)
		);
	}, [cache, config, setForceReload, reloadLimit]);

	return { data: response?.data, loading, error, response, reload };
}

export default useAxios;

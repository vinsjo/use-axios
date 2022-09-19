/* eslint-disable no-mixed-spaces-and-tabs */
import {
	useState,
	useEffect,
	useRef,
	useReducer,
	useCallback,
	useMemo,
} from 'react';
import axios from 'axios';
import { isEqual } from 'x-is-equal';
import { AxiosRequestConfig, AxiosError, AxiosResponse } from 'axios';

/**
 * Triggers a new request
 * @param {AxiosRequestConfig<D> | null} [axiosConfig]  optional updated axios config
 * @param {number} [requestFrequencyLimit]
 * optional number that defines how often requests can be sent, in milliseconds.
 * if not provided, no limit is set.
 */
export type SendRequestCallback<D> = (
	axiosConfig?: AxiosRequestConfig<D> | null,
	requestFrequencyLimit?: number
) => void;

export interface UseAxiosConfig<D = unknown> extends AxiosRequestConfig<D> {
	/**
	 * Defines if requests should be executed automatically when useAxios is called.
	 * If false, requests can only be executed with makeRequest callback.
	 * Default is true.
	 */
	autoExecute?: boolean;
	/**
	 * Wait until componentDidMount is invoked to execute axios request.
	 * Set to true to prevent executing request twice when React.Strictmode is on.
	 * Default value is false.
	 */
	waitUntilMount?: boolean;
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

interface State<T, D> {
	response: null | AxiosResponse<T, D>;
	error: null | Error;
	loading: boolean;
}
interface UseAxiosReturnType<T, D> extends State<T, D> {
	data: T | null;
	sendRequest: SendRequestCallback<D>;
}

function validateConfig<D>(config?: UseAxiosConfig<D>): UseAxiosConfig<D> {
	const defaultConfig: UseAxiosConfig<D> = {
		autoExecute: true,
		waitUntilMount: false,
	};
	if (!config || !(config instanceof Object)) return defaultConfig;
	const { autoExecute, waitUntilMount } = config;
	return {
		...config,
		autoExecute:
			autoExecute === undefined
				? defaultConfig.autoExecute
				: !!autoExecute,
		waitUntilMount:
			waitUntilMount === undefined
				? defaultConfig.waitUntilMount
				: !!waitUntilMount,
	};
}
function getRequestURL(config?: AxiosRequestConfig): string {
	if (typeof config?.url !== 'string') return '';
	const { url, baseURL } = config;
	if (typeof baseURL !== 'string' || /^(http:\/\/|https:\/\/)/i.test(url)) {
		return url;
	}
	try {
		return new URL(url, baseURL).toString();
	} catch (err) {
		err.message && console.error(err.message);
		return '';
	}
}
async function makeRequest<T = unknown, D = unknown>(
	config?: AxiosRequestConfig<D>,
	controller?: AbortController
): Promise<Action<T, D> | null> {
	if (!config) return null;
	try {
		const res = await axios(
			!controller
				? config
				: ({
						...config,
						signal: controller.signal,
				  } as AxiosRequestConfig<D>)
		);
		return { type: 'response', payload: res };
	} catch (err: Error | AxiosError | unknown) {
		if (axios.isCancel(err)) return null;
		return { type: 'error', payload: err as Error | AxiosError };
	}
}

export default function useAxios<T = unknown, D = unknown>(
	config?: UseAxiosConfig<D>
): UseAxiosReturnType<T, D> {
	const [currentConfig, setCurrentConfig] = useState<UseAxiosConfig<D>>(() =>
		validateConfig(config)
	);

	const [waitUntilMount, autoExecute, requestConfig] = useMemo(() => {
		const { waitUntilMount, autoExecute, ...requestConfig } = currentConfig;
		return [waitUntilMount, autoExecute, requestConfig];
	}, [currentConfig]);

	const [lastRequestTime, setLastRequestTime] = useState(0);
	const didMount = useRef(false);
	const cache = useRef<Cache<T, D>>({});
	const requestTimeout = useRef<number>(0);

	const currentURL = useMemo(
		() => getRequestURL(currentConfig),
		[currentConfig]
	);

	const initialState: State<T, D> = {
		response: null,
		error: null,
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

	const triggerRequest = useCallback<SendRequestCallback<D>>(
		(axiosConfig?: UseAxiosConfig<D> | null, requestLimit?: number) => {
			if (requestTimeout.current) return;
			const onTimeout = () => {
				if (currentURL) delete cache.current[currentURL];
				if (axiosConfig instanceof Object) {
					setCurrentConfig(
						validateConfig({
							...axiosConfig,
							waitUntilMount,
							autoExecute,
						})
					);
				}
				setLastRequestTime(Date.now());
				requestTimeout.current = 0;
			};
			if (
				!requestLimit ||
				typeof requestLimit !== 'number' ||
				Number.isNaN(requestLimit)
			) {
				return onTimeout();
			}

			const now = Date.now();
			requestTimeout.current = Number(
				setTimeout(onTimeout, now - (now - requestLimit))
			);
		},
		[
			currentURL,
			setCurrentConfig,
			setLastRequestTime,
			waitUntilMount,
			autoExecute,
		]
	);

	useEffect(() => {
		if (waitUntilMount && !didMount.current) {
			didMount.current = true;
		}
		if (!currentURL || (!autoExecute && !lastRequestTime)) return;

		const cached = cache.current[currentURL];
		// Only fetch from cache if config hasn't changed
		if (cached && isEqual(requestConfig, cached.config)) {
			return dispatch({
				type: 'response',
				payload: cached.response,
			});
		}
		const controller = requestConfig.signal
			? undefined
			: new AbortController();
		dispatch({ type: 'loading' });
		makeRequest<T, D>(requestConfig, controller).then((action) => {
			if (!action) return;
			if (currentURL && action.type === 'response') {
				cache.current[currentURL] = {
					response: action.payload,
					config: requestConfig,
				};
			}
			dispatch(action);
		});
		return () => controller?.abort();
		/* eslint-disable react-hooks/exhaustive-deps */
	}, [currentURL, requestConfig, didMount, lastRequestTime]);

	return useMemo(
		() => ({
			data: !response ? null : response.data,
			loading,
			error,
			response,
			sendRequest: triggerRequest,
		}),
		[response, loading, error, triggerRequest]
	);
}

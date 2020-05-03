import { testing } from '@testmate/testing';

export namespace testeq {

export function expect<T>(given: T, expected: T) {
	// TODO(Jae): 2020-05-03
	// Make this properly compare object types / etc
	// This is a very basic impl.
	if (given === expected) {
		// Success
		return;
	}
	testing.error('given', given, 'but expected', expected);
}

}
